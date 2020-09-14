const { utils } = require("@augmint/js");
utils.loadEnv();

const EventEmitter = require("events");

class BaseTickerProvider extends EventEmitter {
    // for each provider implement a  getter for name
    //     get name() { return "XY"; }
    constructor() {
        super();

        this.lastTicker = {
            lastTradePrice: null,
            vwap: null, // if provider supports vwap (Kraken & Bitstamp)
            time: null, // time of data. NB: some providers (Kraken) doesn't return it. In that case it will be set to requestedAt time
            requestedAt: null,
            receivedAt: null
        };
        this.startedAt = new Date();
        this.isConnected = false;
        this.isDisconnecting = false;
        this.error = null;
    }

    async connect(data) {
        utils.setExitHandler(this._exit.bind(this), this.name);
        this.emit("connecting", data, this);
        this.on("tickerreceived", this._onTickerReceived.bind(this)); // emit from provider

        const connectedEventPromise = new Promise(resolve => {
            this.once("connected", () => {
                this.isConnected = true; // NB: providers set connected when first ticker received as part of connect
                this.isDisconnecting = false;
                resolve();
            });
        });

        // implement in provider, call super() then connect and emit connected event on sucess

        return connectedEventPromise;
    }

    async disconnect(signal) {
        // implement in provider, call super.disconnect(), connect then emit "connected" event on sucess
        this.isDisconnecting = true;
        this.emit("disconnecting", signal, this);
        this.removeAllListeners("tickerreceived");

        const disconnectedEventPromise = new Promise(resolve => {
            this.once("disconnected", () => {
                this.isConnected = false;
                this.isDisconnecting = false;
                resolve();
            });
        });

        return disconnectedEventPromise;
    }

    getStatus() {
        // overwrite in implementation if needed and return extended super.getStatus() result
        return {
            name: this.name,
            lastTicker: this.lastTicker,
            isConnected: this.isConnected,
            startedAt: this.startedAt,
            isDisconnecting: this.isDisconnecting,
            error: this.error
        };
    }

    _onTickerReceived(newTicker) {
        // don't call directly, just emit("tickerrecevied", <newTickerInfo>, this)

        if (!newTicker.time) {
            // if provider doesn't return timestamp of data then we use time we sent the request
            newTicker.time = newTicker.requestedAt;
        }

        if (this.lastTicker.time === null || newTicker.time > this.lastTicker.time) {
            // only update if it's a newer ticker.
            const prevTicker = this.lastTicker;
            this.lastTicker = newTicker;

            this.emit("tickerupdated", newTicker, prevTicker, this);

            if (!prevTicker.price || newTicker.price !== prevTicker.price) {
                this.emit("tickerpricechanged", newTicker, prevTicker, this);
            }
        }
    }

    async _exit(signal) {
        await this.disconnect(signal);
    }
}

module.exports = BaseTickerProvider;
