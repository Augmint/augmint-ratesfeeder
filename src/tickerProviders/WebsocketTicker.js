/* Generic class to handle websocket info from exchanges

maintains lastTrade as: {price, volume, time, tradeId}
depending on ticker provider implementation it updates the last trade when first launched.
call connectAndSubscribe() after created

constructor receives definition object :
{
    NAME: "BITFINEX", // arbitary name for internal logging purposes
    WSS_URL: "", // wss endpoint
    SUBSCRIBE_PAYLOAD: {},
    UNSUBSCRIBE_PAYLOAD: {}, // optional, if set then it will be sent on disconnect
    HEARTBEAT_TIMEOUT: <in ms> // reconnect if no heartbeat (or trade/pong) received from server. optional, default value is below (DEFAULT_HEARTBEAT_TIMEOUT)
    PING_INTERVAL: <in ms>, // Ping server in every ms, null if no ping needed
    PING_PAYLOAD: {},         // only required if PING_INTERVAL is not null

    processMessage: (msg, data) => {} // should  process incoming msg and data and return { type: <MESSAGE_TYPES>, data}.
                format of data in case of MESSAGE_TYPES.TRADE is {price, volume, time, tradeid} volume and tradeid is optional

    // see  example definition in *tickerProvider.js files implemented for a few exchanges
}

Subscribe to the following events emmited:
    // on Every trade:
    <ticker instance>.on("trade", (trade, prevTrade, tickerInstance) => { ... } );

    // only if price changed after trade:
    <ticker instance>.on("pricechange", (trade, prevTrade, tickerInstance) => { ... } ); // only when

    // on intentional disconnect
    <ticker instance>.on("disconnect", (tickerInstance) => {...});

    // when server closed connection and WebsocketTicker tries to reconnect
    <ticker instance>.on("heartbeattimeout", (tickerInstance) => {...});

TODO:
Might be better to use candle data but gdax doesn't support it:
https://github.com/coinbase/gdax-node/issues/203

*/

const ulog = require("ulog");
const log = ulog("WebsocketTicker");
const WebSocket = require("ws");
const EventEmitter = require("events");
const DEFAULT_HEARTBEAT_TIMEOUT = 60000; // reconnect if last no heartbeat for this time (in ms)
const DEFAULT_PING_INTERVAL = null; // most providers don't require pinging but bitfinex disconnects after a while without it
const MESSAGE_TYPES = {
    CONNECTED: "connected",
    SUBSCRIBED: "subscribed",
    UNSUBSCRIBED: "unsubscribed",
    HEARTBEAT: "heartbeat", // heartbeat msg received from server
    TRADE: "trade",
    ERROR: "error",
    PING: "pong", // return if msg is a server response to our ping
    IGNORE: "ignore",
    UNKNOWN: "unknown" // return if unexpected message is recevied, it will throw an error
};

class WebsocketTicker extends EventEmitter {
    constructor(definition) {
        super();
        this.lastHeartbeat = null;
        this.isDisconnecting = false; // to restart connection if it's closed by server
        this.name = definition.NAME;
        this.lastTrade = null; // { price, volume, time}
        this.wsUrl = definition.WSS_URL;
        this.subscribePayload = definition.SUBSCRIBE_PAYLOAD;
        this.unsubscribePayload = definition.UNSUBSCRIBE_PAYLOAD;
        this.processMessage = definition.processMessage;
        this.heartbeatTimeout = definition.HEARTBEAT_TIMEOUT ? definition.HEARTBEAT_TIMEOUT : DEFAULT_HEARTBEAT_TIMEOUT;
        this.pingPayload = definition.PING_PAYLOAD;
        this.pingInterval = definition.PING_INTERVAL ? definition.PING_INTERVAL : DEFAULT_PING_INTERVAL;
        if (this.pingInterval && !this.pingPayload) {
            throw new Error(this.name + " provider PING_INTERVAL is set but no PING_PAYLOAD defined");
        }
    }

    connectAndSubscribe() {
        try {
            ["SIGINT", "SIGHUP", "SIGTERM"].forEach(signal => process.on(signal, signal => this._exit(signal)));

            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => {
                log.debug(this.name, " websocket connected");
                // subscribe
                this.ws.send(JSON.stringify(this.subscribePayload));
            };

            this.ws.onerror = error => {
                log.error(this.name, " error event:\n", error);
            };

            this.ws.onmessage = message => {
                const data = JSON.parse(message.data);
                const result = this.processMessage(message, data);
                switch (result.type) {
                case MESSAGE_TYPES.CONNECTED:
                    log.debug(this.name, "connected.", JSON.stringify(data));
                    if (this.pingInterval) {
                        this.pingIntervalTimer = setInterval(this.ping.bind(this), this.pingInterval);
                    }
                    break;

                case MESSAGE_TYPES.SUBSCRIBED:
                    log.info("\u2713", this.name, "subscribed.", JSON.stringify(result.data));
                    if (result.data.chanId) {
                        // Bitfines returns chanId which is required for unsubscribe
                        this.unsubscribePayload.chanId = result.data.chanId;
                    }
                    this._heartbeatReceived();
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

                case MESSAGE_TYPES.TRADE: {
                    this._heartbeatReceived();
                    const trade = result.data;
                    if (
                        this.lastTrade === null ||
                            (trade.tradeId && trade.tradeId > this.lastTrade.tradeId) ||
                            trade.time > this.lastTrade.time
                    ) {
                        const prevTrade = this.lastTrade;
                        this.lastTrade = trade;

                        this.emit("trade", trade, prevTrade, this);

                        if (!prevTrade || !prevTrade.price || trade.price !== prevTrade.price) {
                            this.emit("pricechange", trade, prevTrade, this);
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
            };
        } catch (error) {
            throw new Error("Error: Can't connect to " + this.name + ". Details:\n" + error);
        }

        this.ws.on("close", () => {
            if (this.isDisconnecting) {
                this.isDisconnecting = false;
                clearTimeout(this.heartbeatTimeoutTimer);
            } else {
                log.warn(this.name, " websocket closed unexpectedly."); // heartbeatTimeout will reconnect
                clearTimeout(this.pingIntervalTimer);
            }
        });
    }

    unsubscribe() {
        if (this.unsubscribePayload) {
            this.ws.send(JSON.stringify(this.unsubscribePayload));
        }
    }

    disconnect() {
        this.emit("disconnecting", this);
        clearTimeout(this.heartbeatTimeoutTimer);
        clearTimeout(this.pingIntervalTimer);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.unsubscribe();
            this.isDisconnecting = true;
            this.ws.close();
        }
    }

    reconnect() {
        this.disconnect();
        this.connectAndSubscribe();
    }

    ping() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(this.pingPayload));
        } else {
            log.warn(this.name, "Warning: Tried to ping when websocket is not open. It's likely a bug, check code");
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
        this.heartbeatTimeoutTimer = setTimeout(this._heartbeatTimedOut.bind(this), this.heartbeatTimeout);
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

module.exports = WebsocketTicker;
