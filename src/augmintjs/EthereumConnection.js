/*********************************************************************************
  Connect to Ethereum network via web3
  maintains connection state, network properties
  reconnects in case of connection dropped. NB: each consumer has to resubscribe atm after reconnection (on "connected" event)

  usage:
  ethereumConnection = new EthereumConnection();
  await ethereumConnection.connect().catch( e => {..} )

  Methods:
    async isConnected() ==> web3.eth.net.isListening()

  Emits:
     connected(EthereumConnection)
     disconnected(EthereumConnection, error, EthereumConnection)  NB: it's only error code 1000, normal end
     connectionLost(error, EthereumConnection)

  Properties:
     web3
     provider (=== web3.currentProvider)
     accounts: array of available accounts received from web3.eth.getAccounts();
     blockGasLimit
     safeBlockGasLimit: as blockGasLimit read on startup and it can change later we provide a "safe" estimate
     isTryingToReconnect
     isStopping - when shutting down because stop() has been called (e.g. SIGTERM/SIGSTOP/SIGINT  )


********************************************************************************/

require("src/augmintjs/helpers/env.js");
const log = require("src/augmintjs/helpers/log.js")("EthereumConnection");
const EventEmitter = require("events");
const promiseTimeout = require("src/augmintjs/helpers/promiseTimeout.js");
const setExitHandler = require("src/augmintjs/helpers/sigintHandler.js");
const Web3 = require("web3");
const CONNECTION_TIMEOUT = 10000;
const CONNECTION_CLOSE_TIMEOUT = 10000;
const ISLISTENING_TIMEOUT = 1000; // used at isConnected() for web3.eth.net.isListening() timeout. TODO: check if we still need with newer web3 or better way?

const DEFAULT_ETHEREUM_CONNECTION_CHECK_INTERVAL = 1000;

class EthereumConnection extends EventEmitter {
    constructor(options = {}) {
        super();

        this.web3 = null;
        this.provider = null;

        this.isStopping = false; /** internal flag to avoid retrying connection when stop() called intentionally  */
        this.isTryingToReconnect = false; /** internal flag to avoid  */
        this.wasConnected = false; /** internal flag used to supress repeating connection lost logging */
        this.connectionCheckTimer = null;

        this.networkId = null;
        this.blockGasLimit = null;

        this.ETHEREUM_CONNECTION_CHECK_INTERVAL =
            options.ETHEREUM_CONNECTION_CHECK_INTERVAL ||
            process.env.ETHEREUM_CONNECTION_CHECK_INTERVAL ||
            DEFAULT_ETHEREUM_CONNECTION_CHECK_INTERVAL;

        this.PROVIDER_TYPE = options.PROVIDER_TYPE || process.env.PROVIDER_TYPE;
        this.PROVIDER_URL = options.PROVIDER_URL || process.env.PROVIDER_URL;
        this.INFURA_PROJECT_ID = options.INFURA_PROJECT_ID || process.env.INFURA_PROJECT_ID || "";

        setExitHandler(this._exit.bind(this), "ethereumConnection", CONNECTION_TIMEOUT + 1000);

        log.info(
            // IMPORTANT: NEVER expose keys even not in logs!
            `** EthereumConnection loaded with settings:
            PROVIDER_TYPE: ${this.PROVIDER_TYPE}
            PROVIDER_URL: ${this.PROVIDER_URL}
            INFURA_PROJECT_ID: ${
                this.INFURA_PROJECT_ID ? this.INFURA_PROJECT_ID.substring(0, 4) + "... rest hidden" : "not provided"
            }
            ETHEREUM_CONNECTION_CHECK_INTERVAL: ${this.ETHEREUM_CONNECTION_CHECK_INTERVAL}
            LOG_AS_SUCCESS_AFTER_N_CONFIRMATION: ${process.env.LOG_AS_SUCCESS_AFTER_N_CONFIRMATION}`
        );
    }

    async isConnected() {
        let result = false;
        if (this.web3) {
            result = await promiseTimeout(ISLISTENING_TIMEOUT, this.web3.eth.net.isListening()).catch(e => {
                // Need timeout b/c sListening pending forever when called after a connection.close() TODO: test if needed in newer web3 than beta 33
                // log.debug("isConnected isListening ERROR (returning false)", e);
                return false;
            });
        }

        return result;
    }

    async connect() {
        this.isStopping = false;

        switch (this.PROVIDER_TYPE) {
            case "http": {
                // provider.on is not a function with web3js beta 33 - maybe newer release? or shall we make it work without it?
                //this.provider = new Web3.providers.HttpProvider(this.PROVIDER_URL + this.INFURA_PROJECT_ID);
                //break;
                throw new Error(this.PROVIDER_TYPE + " is not supported yet");
            }
            case "websocket": {
                this.provider = new Web3.providers.WebsocketProvider(this.PROVIDER_URL + this.INFURA_PROJECT_ID);
                break;
            }
            default:
                throw new Error(this.PROVIDER_TYPE + " is not supported yet");
        }

        this.provider.on("error", this.onProviderError.bind(this));
        this.provider.on("end", this.onProviderEnd.bind(this));
        this.provider.on("connect", this.onProviderConnect.bind(this));

        if (this.web3) {
            // it's  a reconnect
            this.web3.setProvider(this.provider);
        } else {
            this.web3 = new Web3(this.provider);
        }

        const connectedEventPromise = new Promise((resolve, reject) => {
            const tempOnConnected = () => {
                this.removeListener("providerError", tempOnproviderError);
                resolve(); // we wait for our custom setup to finish before we resolve connect()
            };

            const tempOnproviderError = () => {
                this.removeListener("connected", tempOnConnected);
                reject(new Error("EthereumConnection connect failed. Provider error received instead of connect"));
            };

            this.once("connected", tempOnConnected);
            this.once("providerError", tempOnproviderError); // this would be better: this.provider.once("end", e => { .. but web3js has a bug subscrbuing the same event multiple times.
        });

        await promiseTimeout(CONNECTION_TIMEOUT, connectedEventPromise);
    }

    async onProviderConnect() {
        clearTimeout(this.connectionCheckTimer);

        let lastBlock;
        [this.networkId, lastBlock, this.accounts] = await Promise.all([
            this.web3.eth.net.getId().then(res => parseInt(res, 10)),
            this.web3.eth.getBlock("latest"),
            this.web3.eth.getAccounts()
        ]);
        this.blockGasLimit = lastBlock.gasLimit;
        this.safeBlockGasLimit = Math.round(this.blockGasLimit * 0.9);

        if (this.isTryingToReconnect) {
            this.isTryingToReconnect = false;
            log.warn(" EthereumConnection - provider connection recovered");
        } else {
            log.debug(" EthereumConnection - provider connected");
        }

        this.wasConnected = true;
        if (this.ETHEREUM_CONNECTION_CHECK_INTERVAL > 0) {
            this.connectionCheckTimer = setInterval(
                this._checkConnection.bind(this),
                this.ETHEREUM_CONNECTION_CHECK_INTERVAL
            );
        }

        this.emit("connected", this);
    }

    onProviderEnd(e) {
        if (e.code === 1000) {
            // Normal connection closure (currentProvider.close() was called from stop())
            log.debug(" EthereumConnection - Websocket ended with normal end code:", e.code, e.reason);
            this.emit("disconnected", e, this);
        } else {
            if (!this.isTryingToReconnect && !this.isStopping) {
                // Unexpected connection loss - _checkConnection() will try to reconnect in every RECONNECT_INTERVAL
                log.warn(" EthereumConnection - Websocket connection ended with code:", e.code, e.reason);
                this.emit("connectionLost", e, this);
            }
        }
    }

    onProviderError(event) {
        // NB: This is triggered with every isConnected() call too when not connected
        //  Supressing repeating logs while reconnecting - common due to infura dropping web3 connection ca. in every 1-2 hours)
        //       TODO: check if we should implement web3 keepalive pings or if newever versions on web3js are supporting it
        if (!this.isTryingToReconnect && !this.isStopping && this.wasConnected) {
            this.emit("providerError", event, this);
            log.warn(
                " EthereumConnection - provider error. Trying to reconnect. Logging provider errors are supressed until sucessfull reconnect."
            );
        }
    }

    async stop(/*signal*/) {
        this.isStopping = true;
        clearTimeout(this.connectionCheckTimer);

        if (this.web3 && (await this.isConnected())) {
            const disconnectedEventPromise = new Promise(resolve => {
                this.once("disconnected", () => {
                    resolve();
                });
            });

            await this.web3.currentProvider.connection.close();

            await promiseTimeout(CONNECTION_CLOSE_TIMEOUT, disconnectedEventPromise);
        }
    }

    async _exit(signal) {
        await this.stop(signal);
    }

    async _checkConnection() {
        // subscriptions are starting not to arrive on Infura websocket after a while and provider end is not always triggered
        //  TODO: - check if newer versions of web3 (newer than beta33) are handling webscoket connection drops correclty
        if (!this.isStopping && !(await this.isConnected())) {
            if (this.wasConnected) {
                // emit connectionLost (and log) only first reconnect attempt
                log.debug(
                    " EthereumConnection _checkConnection() - ethereumConnection.isConnected() returned false. trying to reconnect"
                );
                this.emit("connectionLost", { message: "checkConnection detected connectionloss" }, this); // triggering this so modules can handle event
                this.wasConnected = false;
            }

            this._tryToReconnect();
        }
    }

    async _tryToReconnect() {
        if (!this.isStopping && !this.isTryingToReconnect) {
            // we won't try to reconnect if previous is still running (this.isTryingToReconnect)
            //    i.e the prev connect() will errror or worst case timeout in CONNECTION_TIMEOUT ms and _checkConnection is called in every x ms
            if (this.wasConnected) {
                log.warn(
                    "  EthereumConnection connnection lost to web3 provider. Keep trying to reconnect. Logging of further warnings supressed until connection recovers"
                );
            }

            this.isTryingToReconnect = true;
            await this.connect().catch(e => {
                // we ignore error and wait for next attempt to be triggered in ETHEREUM_CONNECTION_CHECK_INTERVAL ms
                log.debug(" EthereumConnection reconnection attempt error:", e);
            });
            this.isTryingToReconnect = false;
        }
    }
}

module.exports = EthereumConnection;
