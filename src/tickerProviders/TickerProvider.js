/* Generic class to handle ticker info from exchanges (websocket or pusher)

maintains lastTicker as: {price, volume, time, tradeId}
depending on ticker provider implementation it updates the last trade when first launched.
call connectAndSubscribe() after created

Handles plain WebSocket subscriptions or websocket feeds via pusher (e.g. BitStamp).

constructor receives definition object :
{
    NAME: "BITFINEX", // arbitary name for internal logging purposes
    WSS_URL: "", // wss endpoint  OR PUSHER_APP_KEY if it's a PUSHER provider
    SUBSCRIBE_PAYLOAD: message ,
    UNSUBSCRIBE_PAYLOAD: {}, // optional, if set then it will be sent on disconnect
    HEARTBEAT_TIMEOUT: <in ms> // reconnect if no heartbeat (or trade/pong) received from server. optional, default value is below (DEFAULT_HEARTBEAT_TIMEOUT)
    PING_INTERVAL: <in ms>, // Ping server in every ms, null if no ping needed
    PING_PAYLOAD: {},         // only required if PING_INTERVAL is not null

    processMessage: (msg, data) => {} // should  process incoming msg and data and return { type: <MESSAGE_TYPES>, data}.
                format of data in case of MESSAGE_TYPES.TICKER_UPDATE is {price, volume, time, tradeid} volume and tradeid is optional

    // see  example definition in *tickerProvider.js files implemented for a few exchanges
}

Subscribe to the following events emmited:
    // on Every trade:
    <ticker instance>.on("trade", (newTicker, prevTicker, tickerProvider) => { ... } );

    // only if price changed after trade:
    <ticker instance>.on("pricechange", (newTicker, prevTicker, tickerProvider) => { ... } ); // only when

    // on intentional disconnect
    <ticker instance>.on("disconnecting", (tickerProvider) => {...});

    // when server closed connection and TickerProvider tries to reconnect
    <ticker instance>.on("heartbeattimeout", (tickerProvider) => {...});

TODO:
-  Might be better to use vwap or candle data but
   - gdax doesn't support it: https://github.com/coinbase/gdax-node/issues/203
   - BitStamp only returns via REST and hourly vwap window only (https://www.bitstamp.net/api/v2/ticker_hour/{currency_pair}/) - would require polling
   - Kraken should be fine, it returns in ohlc channel. vwap window can be set to 1 / 5 / 15 / 30 etc. minutes
    Maybe use vwap if available from provider otherwise last trade price?
- reconsider if we would be better of polling REST instead of websocket - would result a much simpler code
- BitStamp released V2 websocket API which is without pusher - we could get rid of pusher specific code

*/

const ulog = require("ulog");
const log = ulog("TickerProvider");
const WebSocket = require("ws");
const Pusher = require("pusher-js");
const EventEmitter = require("events");
const DEFAULT_WSS_HEARTBEAT_TIMEOUT = 60000; // reconnect if last no heartbeat for this time (in ms). Only for WSS connections, pusher has activity_timeout
const DEFAULT_PING_INTERVAL = null; // most providers don't require pinging but bitfinex disconnects after a while without it
const MESSAGE_TYPES = {
    CONNECTED: "connected",
    SUBSCRIBED: "subscribed",
    UNSUBSCRIBED: "unsubscribed",
    HEARTBEAT: "heartbeat", // heartbeat msg received from server
    TICKER_UPDATE: "tickerupdate",
    ERROR: "error",
    PING: "pong", // return if msg is a server response to our ping
    IGNORE: "ignore",
    UNKNOWN: "unknown" // return if unexpected message is recevied, it will throw an error
};

const PROVIDER_TYPES = {
    WSS: "wss",
    PUSHER: "pusher"
};

class TickerProvider extends EventEmitter {
    constructor(definition) {
        super();
        this.isDisconnecting = false; // to restart connection if it's closed by server
        ["SIGINT", "SIGHUP", "SIGTERM"].forEach(signal => process.on(signal, signal => this._exit(signal)));

        this.lastHeartbeat = null;
        this.name = definition.NAME;
        this.lastTicker = null; // { price, volume, time}

        // if standard websocket connection
        this.wssUrl = definition.WSS_URL;
        this.subscribePayload = definition.SUBSCRIBE_PAYLOAD;
        this.unsubscribePayload = definition.UNSUBSCRIBE_PAYLOAD;

        // if pusher type connection
        this.pusherAppKey = definition.PUSHER_APP_KEY;
        this.pusherChannelName = definition.PUSHER_CHANNEL_NAME;
        this.pusherChannelEventName = definition.PUSHER_CHANNEL_EVENT_NAME;

        this.processMessage = definition.processMessage;
        // some providers doesn't send a snapshot after subscription.
        // In that case implement this function in definition and return a tickerInfo object
        //   see example with krakenTickerProvider
        // if provider returns a snapshot after subscription then process message at processMessage and
        //       leave fetchCurrentTicker as null in definition (see gdaxTickerProvider for example)
        this.fetchCurrentTicker = definition.fetchCurrentTicker;

        this.pingPayload = definition.PING_PAYLOAD;
        this.pingInterval = definition.PING_INTERVAL ? definition.PING_INTERVAL : DEFAULT_PING_INTERVAL;

        this.providerType = this.wssUrl ? PROVIDER_TYPES.WSS : PROVIDER_TYPES.PUSHER;

        if (this.providerType === PROVIDER_TYPES.WSS) {
            this.heartbeatTimeout = definition.HEARTBEAT_TIMEOUT
                ? definition.HEARTBEAT_TIMEOUT
                : DEFAULT_WSS_HEARTBEAT_TIMEOUT;
        } else {
            this.heartbeatTimeout = definition.HEARTBEAT_TIMEOUT;
        }

        /* some basic param checks */

        if (this.pingInterval && !this.pingPayload) {
            throw new Error(this.name + " provider PING_INTERVAL is set but no PING_PAYLOAD defined");
        }

        if (this.wssUrl && this.pusherAppKey) {
            throw new Error(this.name + " provider both WSS_URL and pusherAppKey defined. Use only one");
        }

        if (this.providerType === PROVIDER_TYPES.PUSHER) {
            if (!this.pusherChannelName || !this.pusherChannelEventName) {
                throw new Error(
                    this.name +
                        " provide both PUSHER_CHANNEL_NAME and PUSHER_CHANNEL_EVENT_NAME for PUSHER provider type"
                );
            }

            if (definition.HEARTBEAT_TIMEOUT) {
                log.warn(
                    this.name,
                    "is PUSHER provider and HEARTBEAT_TIMEOUT was set. It should be rather not provided so it will be automatically set based on activity_timeout provided pusher handshake "
                );
            }
        }
    }

    connectAndSubscribe() {
        try {
            if (!this.isDisconnecting) {
                // set initial price for providers which doesn't return initial snapshot after subscription
                this._fetchInitialTickerInfo();

                switch (this.providerType) {
                case PROVIDER_TYPES.WSS:
                    this.ws = new WebSocket(this.wssUrl);

                    this.ws.onopen = () => {
                        log.debug(this.name, " websocket connected");
                        // subscribe
                        if (!this.isDisconnecting) {
                            this.ws.send(JSON.stringify(this.subscribePayload));
                        }
                    };

                    this.ws.onerror = this._onProviderError.bind(this);

                    this.ws.onmessage = this._onProviderMessage.bind(this);

                    this.ws.on("close", this._onProviderDisconnected.bind(this));

                    break;

                case PROVIDER_TYPES.PUSHER:
                    this.pusherSocket = new Pusher(this.pusherAppKey);

                    if (!this.heartbeatTimeout) {
                        this.heartbeatTimeout = this.pusherSocket.config.activity_timeout + 60000;
                    }

                    this.pusherSocket.connection.bind("error", this._onProviderError.bind(this));

                    this.pusherSocket.connection.bind("connected", this._onProviderConnected.bind(this));

                    this.pusherSocket.connection.bind("disconnected", this._onProviderDisconnected.bind(this));

                    this.pusherSocket.connection.bind("state_change", states => {
                        // states = {previous: 'oldState', current: 'newState'}
                        log.debug(this.name, "state change:", states);
                    });

                    /* Subscribe to PUSHER_CHANNEL_NAME */

                    this.pusherChannel = this.pusherSocket.subscribe(this.pusherChannelName);

                    this.pusherChannel.bind(
                        "pusher:subscription_succeeded",
                        this._onProviderSubscriptionSucceeded.bind(this)
                    );

                    this.pusherChannel.bind("pusher:subscription_error", error => {
                        throw new Error(
                            `Error: Can't subscribe to ${this.pusherChannelName} at ${this.name}. Error: ${error}`
                        );
                    });

                    this.pusherChannel.bind(this.pusherChannelEventName, this._onProviderMessage.bind(this));

                    this.pusherSocket.connection.bind_global((/*event , data*/) => {
                        // on any message not only this.pusherSocket.bind("pusher:pong", () => { });
                        this._heartbeatReceived();
                    });

                    break;

                default:
                    // we sholdn't get here...
                    throw new Error(
                        "Error: Can't connect to " + this.name + ". Invalid provider type: " + this.providerType
                    );
                }
            }
        } catch (error) {
            throw new Error("Error: Can't connect to " + this.name + ". Details:\n" + error);
        }
    }

    unsubscribe() {
        if (this.providerType === PROVIDER_TYPES.WSS && this.unsubscribePayload) {
            this.ws.send(JSON.stringify(this.unsubscribePayload));
        } else {
            this.pusherSocket.unsubscribe(this.pusherChannelName);
            this.pusherChannel.unbind_all();
        }
    }

    disconnect() {
        this.isDisconnecting = true;
        this.emit("disconnecting", this);

        clearTimeout(this.heartbeatTimeoutTimer);
        clearTimeout(this.pingIntervalTimer);

        switch (this.providerType) {
        case PROVIDER_TYPES.WSS:
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.isDisconnecting = true;
                this.unsubscribe();
                this.ws.close();
            }
            break;

        case PROVIDER_TYPES.PUSHER:
            if (
                (this.pusherSocket &&
                        this.pusherSocket.connection &&
                        this.pusherSocket.connection.state === "connected") ||
                    this.pusherSocket.connection.state == "connecting"
            ) {
                this.unsubscribe();
                this.pusherSocket.unbind_all();
                this.pusherSocket.disconnect();
            }
            break;

        default:
            // we sholdn't get here...
            log.error("Error:", this.name + "disconnect(). Invalid provider type: " + this.providerType);
        }
    }

    reconnect() {
        this.disconnect();
        this.connectAndSubscribe();
    }

    ping() {
        if (!this.isDisconnecting) {
            if (this.providerType !== PROVIDER_TYPES.WSS) {
                throw new Error(this.name, "ping() is not supported for", this.providerType, "providerType");
            }
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(this.pingPayload));
            } else {
                log.warn(this.name, "Warning: Tried to ping when websocket is not open. It's likely a bug, check code");
            }
        }
    }

    _onProviderError(error) {
        log.error(this.name, " error event:\n", error);
    }

    _onProviderConnected(data) {
        log.debug(this.name, "connected.", JSON.stringify(data));
        if (this.pingInterval && !this.isDisconnecting) {
            this.pingIntervalTimer = setInterval(this.ping.bind(this), this.pingInterval);
        }
    }

    _onProviderDisconnected() {
        if (this.isDisconnecting) {
            log.debug(this.name, "provider disconnected (expected)");
            this.isDisconnecting = false;
            clearTimeout(this.heartbeatTimeoutTimer);
        } else {
            log.warn(this.name, " websocket closed unexpectedly."); // heartbeatTimeout will reconnect
            clearTimeout(this.pingIntervalTimer);
        }
    }

    _onProviderSubscriptionSucceeded(data) {
        log.info("\u2713", this.name, "subscribed.", JSON.stringify(data));
        if (data.chanId) {
            // Bitfinex returns chanId which is required for unsubscribe
            this.unsubscribePayload.chanId = data.chanId;
        }
        this._heartbeatReceived();
    }

    _onProviderMessage(message) {
        const result = this.processMessage(message);
        switch (result.type) {
        case MESSAGE_TYPES.CONNECTED:
            this._onProviderConnected(JSON.stringify(result.data));
            break;

        case MESSAGE_TYPES.SUBSCRIBED:
            this._onProviderSubscriptionSucceeded(result.data);
            break;

        case MESSAGE_TYPES.UNSUBSCRIBED:
            // NB:  GDAX not always sends
            log.debug(this.name, "UNsubscribed.", JSON.stringify(result.data));
            break;

        case MESSAGE_TYPES.HEARTBEAT:
            this._heartbeatReceived();
            break;

        case MESSAGE_TYPES.PONG:
            this._heartbeatReceived();
            break;

        case MESSAGE_TYPES.TICKER_UPDATE: {
            this._heartbeatReceived();
            const ticker = result.data;
            if (
                this.lastTicker === null ||
                    (ticker.tradeId && ticker.tradeId > this.lastTicker.tradeId) ||
                    ticker.time > this.lastTicker.time
            ) {
                const prevTicker = this.lastTicker;
                this.lastTicker = ticker;

                this.emit("trade", ticker, prevTicker, this);

                if (!prevTicker || !prevTicker.price || ticker.price !== prevTicker.price) {
                    this.emit("pricechange", ticker, prevTicker, this);
                }
            }

            break;
        }

        case MESSAGE_TYPES.ERROR:
            log.error(this.name, " received an error message. Data:\n", result.data);
            break;
        case MESSAGE_TYPES.IGNORE:
            break;
        default:
            log.error(this.name, "received an unknown message type. Data:\n", result.data);
        }
    }

    async _fetchInitialTickerInfo() {
        // only works for tickerProviders where fetchCurrentTicker is implemented
        try {
            if (this.fetchCurrentTicker) {
                const tickerInfo = await this.fetchCurrentTicker();
                if (!this.lastTicker || !this.lastTicker.price || this.lastTicker.price === 0) {
                    this.lastTicker = tickerInfo;
                }
            }
        } catch (error) {
            log.error(this.name, "can't fetch initial ticker info. fetchCurrentTicker failed. ", error);
            process.exit(1);
        }
    }

    _exit(signal) {
        log.info(`\n*** ${this.name} received ${signal}. Disconnecting.`);
        this.disconnect();
    }

    _heartbeatReceived() {
        // reset heartbeat timer anytime a meaningful message received (heartbeat, trade or subscribe)
        this.lastHeartbeat = new Date();
        clearTimeout(this.heartbeatTimeoutTimer);
        if (!this.isDisconnecting) {
            this.heartbeatTimeoutTimer = setTimeout(this._heartbeatTimedOut.bind(this), this.heartbeatTimeout);
        }
    }

    _heartbeatTimedOut() {
        if (!this.isDisconnecting) {
            this.emit("heartbeattimeout", this);
            this.reconnect();
        }
    }

    static get MESSAGE_TYPES() {
        return MESSAGE_TYPES;
    }
}

module.exports = TickerProvider;
