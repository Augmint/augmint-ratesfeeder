/*
calls matchMultiple tx every time a new Order event received

emmitted events:

*/
const loadEnv = require("src/helpers/loadEnv.js");
const { Augmint, utils } = require("@augmint/js");

const config = loadEnv();

if (config.LOG) {
    utils.logger.level = config.LOG;
}
const log = utils.logger("MatchMaker");

const setExitHandler = utils.setExitHandler;
const promiseTimeout = utils.promiseTimeout;

const EventEmitter = require("events");
const Exchange = require("@augmint/js/src/Exchange.js");

class MatchMaker extends EventEmitter {
    constructor() {
        super();
        this.augmint = null;
        this.ethereumConnection = null;
        this.web3 = null;
        this.isInitialised = false;

        // flag if processing is going on to avoid sending a
        // new matchmultiple while the previous  is still running
        this.isProcessingOrderBook = false;

        // flag if a newOrder lands while still processing a previous one
        // if processing done we will trigger a new checkAndMatch based on this
        this.queueNextCheck = false;

        this.newOrderEventSubscription = null;
        this.exchangeInstance = null;
        this.account = null;

        setExitHandler(this._exit.bind(this), "MatchMaker");
    }

    async init() {
        const myAugmint = await Augmint.create(config);
        this.ethereumConnection = myAugmint.ethereumConnection;
        this.web3 = myAugmint.ethereumConnection.web3;
        this.augmint = myAugmint;

        this.account = process.env.MATCHMAKER_ETHEREUM_ACCOUNT;

        if (!this.web3.utils.isAddress(this.account)) {
            throw new Error("Invalid MATCHMAKER_ETHEREUM_ACCOUNT: " + this.account);
        }

        if (await this.ethereumConnection.isConnected()) {
            await this.onEthereumConnected(); // connect event might be already triggered so we need to call it on init
        }

        this.ethereumConnection.on("connected", this.onEthereumConnected.bind(this));
        this.ethereumConnection.on("connectionLost", this.onEthereumConnectionLost.bind(this));

        this.isInitialised = true;

        log.info(
            // IMPORTANT: NEVER expose keys even not in logs!
            `** MatchMaker started with settings:
            MATCHMAKER_ETHEREUM_ACCOUNT: ${process.env.MATCHMAKER_ETHEREUM_ACCOUNT}
            MATCHMAKER_ETHEREUM_PRIVATE_KEY: ${
                process.env.MATCHMAKER_ETHEREUM_PRIVATE_KEY ? "[secret]" : "not provided"
            }
            Exchange contract: ${this.exchange.address}`
        );
    }

    async onNewOrder(event) {
        this.checkAndMatchOrders();

        this.emit("NewOrder", event, this);
    }

    async onOrderFill(event) {
        this.emit("OrderFill", event, this);
    }

    async onEthereumConnected() {
        if (!this.exchange) {
            this.exchange = this.augmint.exchange;
        }

        // subscribing on first connection OR resubscribing in case of reconnection - check if latter is needed in newer web3 releases: https://github.com/ethereum/web3.js/pull/1966
        await this._subscribe();

        this.checkAndMatchOrders();
    }

    async onEthereumConnectionLost() {
        this._unsubscribe();
    }

    async checkAndMatchOrders() {
        if (this.isProcessingOrderBook) {
            this.queueNextCheck = true; // so _checkAndMatchOrders will call this fx again once finished
        } else {
            this.isProcessingOrderBook = true;
            await promiseTimeout(process.env.MATCHMAKER_CHECKANDMATCHORDERS_TIMEOUT, this._checkAndMatchOrders()).catch(
                error => {
                    // NB: it's not necessarily an error, ethereum network might be just slow.
                    log.error("checkAndMatchOrders failed with Error: ", error);
                }
            );
            this.isProcessingOrderBook = false;
        }
    }

    async _checkAndMatchOrders() {
        const matchingOrders = await this.exchange.getMatchingOrders(); // default gaslimit ethereumConnection.safeBlockGasLimit

        if (matchingOrders.buyIds.length > 0) {
            const nonce = await this.ethereumConnection.getAccountNonce(this.account);

            const tx = await this.exchange.signAndSendMatchMultipleOrders(
                this.account,
                process.env.MATCHMAKER_ETHEREUM_PRIVATE_KEY,
                matchingOrders
            );

            log.log(
                `==> checkAndMatchOrders() sending matchMultipleOrdersTx. nonce: ${nonce} matching Orders: ${
                    matchingOrders.sellIds.length
                }`
            );

            const receipt = await tx
                .once("transactionHash", hash => {
                    log.debug(`    checkAndMatchOrders() nonce: ${nonce}  txHash: ${hash} hash received`);
                })
                .once("receipt", receipt => {
                    log.debug(
                        `    checkAndMatchOrders() nonce: ${nonce}  txHash: ${
                            receipt.transactionHash
                        } receipt received.  gasUsed: ${receipt.gasUsed}`
                    );
                })
                .on("confirmation", (confirmationNumber, receipt) => {
                    if (
                        confirmationNumber === parseInt(process.env.LOG_AS_SUCCESS_AFTER_N_CONFIRMATION) &&
                        receipt.status // for failed tx confirmations we just emit confirmation event, tx will trigger error
                    ) {
                        this.emit("txSuccess", nonce, confirmationNumber, receipt, this);
                    } else {
                        this.emit("txConfirmation", nonce, confirmationNumber, receipt, this);
                        log.debug(
                            `    checkAndMatchOrders() nonce: ${nonce}  txHash: ${
                                receipt.transactionHash
                            } Confirmation #${confirmationNumber} received.`
                        );
                    }
                })
                .on("error", error => {
                    this.emit("txError", nonce, null, this); // web3 doesn't seem to provide receipt here ATM...
                    throw new Error("checkAndMatchOrders Error sending tx with nonce: " + nonce + " Error:\n" + error);
                    //log.error("checkAndMatchOrders Error sending tx with nonce: " + nonce + " Error:\n" + error);
                })
                .then(async receipt => {
                    // TODO: check with latest web3, it might be a duplicate logging as confirmation after  transactionConfirmationBlocks is the same
                    log.debug(`    checkAndMatchOrders() nonce: ${nonce}  txHash: ${receipt.transactionHash} mined.`);
                    return receipt;
                });

            if (!receipt.status) {
                this.emit("txError", nonce, receipt, this);
                log.error(`checkAndMatchOrders() ERROR. tx failed, returned status: ${
                    receipt.status
                } nonce: ${nonce} receipt:
                       ${JSON.stringify(receipt, 3, null)}`);
            }

            if (this.queueNextCheck) {
                this.isProcessingOrderBook = false; // we set it here just in case this call resolves later then the checkAndMatch call below run
                this.queueNextCheck = false;
                this.checkAndMatchOrders();
            }
        }
    }

    async stop() {
        this.emit("stopping", this);

        await this._unsubscribe();

        this.emit("stopped", this);
    }

    async _subscribe() {
        this.newOrderEventSubscription = this.exchangeInstance.events
            .NewOrder()
            .on("data", this.onNewOrder.bind(this))
            .on("error", error => {
                log.warn(" MatchMaker NewOrder subscription error:", error);
            });

        this.orderFillEventSubscription = this.exchangeInstance.events
            .OrderFill()
            .on("data", this.onOrderFill.bind(this))
            .on("error", error => {
                log.warn(" MatchMaker OrderFill subscription error:", error);
            });
    }

    async _unsubscribe() {
        if (this.newOrderEventSubscription) {
            await Promise.all([
                this.newOrderEventSubscription.unsubscribe(),
                this.orderFillEventSubscription.unsubscribe()
            ]);
            this.newOrderEventSubscription = null;
            this.orderFillEventSubscription = null;
        }
    }

    async _exit(signal) {
        log.info(`*** MatchMaker received ${signal}. Stopping.`);
        await this.stop();
    }
}

module.exports = MatchMaker;
