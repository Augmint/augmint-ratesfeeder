const log = require("src/log.js")("TickerProvider");
const EventEmitter = require("events");
const setExitHandler = require("src/helpers/sigintHandler.js");

class BaseTickerProvider extends EventEmitter {
    // for each provider implement a  getter for name
    //     get name() { return "XY"; }
    constructor() {
        super();

        this.lastTicker = { price: null, receivedAt: null };
        this.startedAt = new Date();
        this.isConnected = false;
        this.isDisconnecting = false;
        this.error = null;
    }

    async connect(data) {
        setExitHandler(this._exit.bind(this), this.name);
        this.emit("connecting", data, this);
        this.on("tickerreceived", this._onTickerUpdate.bind(this)); // emit from provider

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

    async disconnect() {
        // implement in provider, call super.disconnect(), connect then emit "connected" event on sucess
        this.isDisconnecting = true;
        this.emit("disconnecting", this);
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

    _onTickerUpdate(newTicker) {
        // don't call directly, just emit("tickerrecevied", <newTickerInfo>, this)
        const prevTicker = this.lastTicker;
        this.lastTicker = newTicker;
        this.emit("tickerupdated", newTicker, prevTicker, this);
        if (!prevTicker.price || newTicker.price !== prevTicker.price) {
            this.emit("tickerpricechanged", newTicker, prevTicker, this);
        }
    }

    async _exit(signal) {
        log.info(`*** ${this.name} received ${signal}. Disconnecting.`);
        await this.disconnect();
    }
}

module.exports = BaseTickerProvider;
