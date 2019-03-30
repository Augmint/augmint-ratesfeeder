/*
calls matchMultiple tx every time a new Order event received

emmitted events:

*/
require("src/augmintjs/helpers/env.js");
const log = require("src/augmintjs/helpers/log.js")("MatchMaker");
const EventEmitter = require("events");
const setExitHandler = require("src/augmintjs/helpers/sigintHandler.js");
const contractsHelper = require("src/augmintjs/contractConnection.js");

const Exchange = require("src/abiniser/abis/Exchange_ABI_d3e7f8a261b756f9c40da097608b21cd.json");

class MatchMaker extends EventEmitter {
    constructor(web3) {
        super();
        this.web3 = web3;
        this.isInitialised = false;
        this.isConnected = false;
        this.newOrderEventSubscription = null;
        this.exchangeInstance = null;
        this.account = null;
    }

    async init() {
        setExitHandler(this._exit.bind(this), "RatesFeeder");

        this.account = process.env.MATCHMAKER_ETHEREUM_ACCOUNT;

        if (!this.web3.utils.isAddress(this.account)) {
            throw new Error("Invalid MATCHMAKER_ETHEREUM_ACCOUNT: " + this.account);
        }
        this.web3.eth.defaultAccount = this.account;

        this.exchangeInstance = await contractsHelper.connectLatest(this.web3, Exchange);
        //this.newOrderEventSubscription = this.exchangeInstance.events.NewOrder().on("data", this.onNewOrder.bind(this));

        this.isInitialised = true;
        this.isConnected = true;

        log.info(
            // IMPORTANT: NEVER expose keys even not in logs!
            `** MatchMaker started with settings:
            MATCHMAKER_ETHEREUM_ACCOUNT: ${process.env.MATCHMAKER_ETHEREUM_ACCOUNT}
            MATCHMAKER_ETHEREUM_PRIVATE_KEY: ${
    process.env.MATCHMAKER_ETHEREUM_PRIVATE_KEY ? "[secret]" : "not provided"
}
            Exchange contract: ${this.exchangeInstance._address}`
        );
    }

    onNewOrder(event) {
        log.debug("New order id:", event.returnValues.orderId);
        this.emit("NewOrder", event, this);
    }

    async stop() {
        if (this.newOrderEventSubscription) {
            await this.newOrderEventSubscription.unsubscribe();
        }
        this.isConnected = false;
        log.info("MatchMaker stopped.");
    }

    async _exit(signal) {
        log.info(`*** MatchMaker received ${signal}. Stopping.`);
        await this.stop();
    }
}

module.exports = MatchMaker;
