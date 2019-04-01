/*********************************************************************************
  Connect to Ethereum network via web3
  maintains connection state, network properties
  reconnects in case of connection dropped. NB: each consumer has to resubscribe atm after reconnection (on "connected" event)

  usage:
  ethereumConnection = new EthereumConnection();
  await ethereumConnection.connect().catch( e => {..} )

  emits:
     connected(EthereumConnection)
     disconnected(EthereumConnection, error, EthereumConnection)  NB: it's only error code 1000, normal end
     connectionLost(error, EthereumConnection)

  properties:
     web3
     provider (=== web3.currentProvider)
     isConnected (=== web3._provider.connected)
     blockGasLimit
     safeBlockGasLimit: as blockGasLimit read on startup and it can change later we provide a "safe" estimate
     isTryingToReconnect
     isStopping - when shutting down because stop() has been called (e.g. SIGTERM/SIGSTOP/SIGINT  )


********************************************************************************/

require("src/augmintjs/helpers/env.js");
const log = require("src/augmintjs/helpers/log.js")("runFeeder");
const EventEmitter = require("events");
const promiseTimeout = require("src/augmintjs/helpers/promiseTimeout.js");
const setExitHandler = require("src/augmintjs/helpers/sigintHandler.js");
const Web3 = require("web3");
const RECONNECT_INTERVAL = 5000;
const CONNECTION_TIMEOUT = 5000;
const CONNECTION_CLOSE_TIMEOUT = 10000;

class EthereumConnection extends EventEmitter {
    constructor() {
        super();
        this.web3 = null;

        this.provider = null;

        this.isStopping = false;
        this.isTryingToReconnect = false;

        this.reconnectTimer = null;

        this.blockGasLimit = null;

        setExitHandler(this._exit.bind(this), "ethereumConnection");
        log.info(
            // IMPORTANT: NEVER expose keys even not in logs!
            `** EthereumConnection loaded with settings:
            PROVIDER_TYPE: ${process.env.PROVIDER_TYPE}
            PROVIDER_URL: ${process.env.PROVIDER_URL}
            INFURA_PROJECT_ID: ${
    process.env.INFURA_PROJECT_ID
        ? process.env.INFURA_PROJECT_ID.substring(0, 4) + "... rest hidden"
        : "not provided"
}
            LOG_AS_SUCCESS_AFTER_N_CONFIRMATION: ${process.env.LOG_AS_SUCCESS_AFTER_N_CONFIRMATION}`
        );

        this.projectId = process.env.INFURA_PROJECT_ID || "";
    }

    get isConnected() {
        return (this.web3 && this.web3._provider && this.web3._provider.connected) || false;
    }

    async connect() {
        this.isStopping = false;

        switch (process.env.PROVIDER_TYPE) {
        case "http": {
            // provider.on is not a function with web3js beta 33 - maybe newer release? or shall we make it work without it?
            //this.provider = new Web3.providers.HttpProvider(process.env.PROVIDER_URL + this.projectId);
            //break;
            throw new Error(process.env.PROVIDER_TYPE + " is not supported yet");
        }
        case "websocket": {
            this.provider = new Web3.providers.WebsocketProvider(process.env.PROVIDER_URL + this.projectId);
            break;
        }
        default:
            throw new Error(process.env.PROVIDER_TYPE + " is not supported yet");
        }

        // this.provider.on("error", e => log.error("WS Error", e));
        this.provider.on("end", this.onProviderEnd.bind(this));
        this.provider.on("connect", this.onProviderConnect.bind(this));

        if (this.web3) {
            // it's  a reconnect
            this.web3.setProvider(this.provider);
        } else {
            this.web3 = new Web3(this.provider);
        }

        const connectedEventPromise = new Promise(resolve => {
            this.once("connected", () => {
                resolve(); // we wait for our custom setup to finish before we resolve connect()
            });
        });

        const ret = promiseTimeout(CONNECTION_TIMEOUT, connectedEventPromise);

        return ret;
    }

    async onProviderConnect() {
        if (this.isTryingToReconnect) {
            clearTimeout(this.reconnectTimer);
            this.isTryingToReconnect = false;
            log.warn(" EthereumConnection - provider connection recovered");
        } else {
            this.blockGasLimit = (await this.web3.eth.getBlock("latest")).gasLimit;
            this.safeBlockGasLimit = Math.round(this.blockGasLimit * 0.9);

            log.debug(" EthereumConnection - provider connected");
        }
        this.emit("connected", this);
    }

    onProviderEnd(e) {
        if (e.code === 1000) {
            // Normal connection closure (currentProvider.close() was called from stop())
            log.debug(" EthereumConnection - Websocket ended with normal end code:", e.code, e.reason);
            this.emit("disconnected", e, this);
        } else {
            if (!this.isTryingToReconnect) {
                // Unexpected connection loss - _tryToReconnect() will try to reconnect in every RECONNECT_INTERVAL
                log.warn(" EthereumConnection - Websocket connection ended with code:", e.code, e.reason, e);
                this.emit("connectionLost", e, this);
                this._tryToReconnect();
            }
        }
    }

    async stop() {
        this.isStopping = true;
        clearTimeout(this.reconnectTimer);
        if (this.web3 && this.isConnected) {
            await this.web3.currentProvider.connection.close();
        }

        const disconnectedEventPromise = new Promise(resolve => {
            this.once("disconnected", () => {
                resolve(); // we wait for our custom setup to finish before we resolve connect()
            });
        });

        const ret = promiseTimeout(CONNECTION_CLOSE_TIMEOUT, disconnectedEventPromise);
        return ret;
    }

    async _exit(signal) {
        log.info(`*** EthereumConnection received ${signal}. Stopping.`);
        await this.stop();
    }

    async _tryToReconnect() {
        if (!this.isStopping && !this.web3._provider.connected) {
            if (!this.isTryingToReconnect) {
                this.isTryingToReconnect = true;
                log.warn(
                    "  EthereumConnection connnection lost to web3 provider. Keep trying to reconnect. Logging of further warnings supressed until connection recovers"
                );
            }
            // log.debug("trying to reconnect...");
            await this.connect().catch(e => {
                // we ignore set schedule next attempt
                log.debug(" EthereumConnection reconnection attempt error:", e);
                this.reconnectTimer = setTimeout(this._tryToReconnect.bind(this), RECONNECT_INTERVAL);
            });
        }
    }
}

module.exports = EthereumConnection;
