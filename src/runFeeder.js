require("src/augmintjs/helpers/env.js");
const log = require("src/augmintjs/helpers/log.js")("runFeeder");
const EthereumConnection = require("src/augmintjs/EthereumConnection.js");
const RatesFeeder = require("src/RatesFeeder.js");
const MatchMaker = require("src/MatchMaker/MatchMaker.js");
const subscribeTickers = require("src/subscribeTickers.js");
const statusApi = require("src/statusApi/server.js");

log.info(
    `** runFeeder starting with settings:
    NODE_ENV: ${process.env.NODE_ENV}
    LOG: ${process.env.LOG}`
);
const ethereumConnection = new EthereumConnection();

ethereumConnection.on("connected", onEthereumConnected);
ethereumConnection.on("disconnecting", onEthereumDisconnecting);
ethereumConnection.on("disconnected", onEthereumDisconnected);

ethereumConnection
    .connect()
    .then(() => {
        const ratesFeeder = new RatesFeeder(ethereumConnection, subscribeTickers.tickers);
        const matchMaker = new MatchMaker(ethereumConnection);

        statusApi.start(ratesFeeder);

        matchMaker.init().catch(error => {
            log.error("Error: Can't init MatchMaker. Details:\n", error);
            process.exit(1);
        });

        matchMaker.on("NewOrder", onNewOrder);
        matchMaker.on("OrderFill", onOrderFill);
        matchMaker.on("txSuccess", onMatchMakerTxSuccess);

        ratesFeeder
            .init()

            .then(async () => {
                subscribeTickers.tickers.forEach(tickerProvider => {
                    tickerProvider.on("tickerreceived", onTickerReceived);
                    tickerProvider.on("tickerupdated", onTickerUpdated);
                    tickerProvider.on("tickerpricechanged", onTickerPriceChanged);
                    tickerProvider.on("connecting", onTickerConnecting);
                    tickerProvider.on("connected", onTickerConnected);
                    tickerProvider.on("disconnecting", onTickerDisconnecting);
                    tickerProvider.on("disconnected", onTickerDisconnected);
                    tickerProvider.on("providerError", onTickerProviderError);
                });

                await subscribeTickers.connectAll();
            })
            .catch(error => {
                log.error("Error: Can't init ratesFeeder. Details:\n", error);
                process.exit(1);
            });
    })
    .catch(error => {
        log.error("Error: Can't connect to ethereum network. Details:\n", error);
        process.exit(1);
    });

/********* EthereumConnection event handlers (for logging)*****************/
function onNewOrder(event, matchMaker) {
    log.debug("New order id:", event.returnValues.orderId);
}

function onOrderFill(event, matchMaker) {
    log.debug(
        `Order filled. buy id: ${event.returnValues.buyTokenOrderId} sell id: ${event.returnValues.sellTokenOrderId}`
    );
}

function onMatchMakerTxSuccess(nonce, confirmationNumber, receipt, matchMaker) {
    log.log(
        `    \u2713 checkAndMatchOrders() nonce: ${nonce}  txHash: ${
            receipt.transactionHash
        } confirmed - received ${confirmationNumber} confirmations  `
    );
}

/*** EthereumConnection event handlers ****/

function onEthereumConnected(ethereumConnection) {
    // log.info("Ethereum connected.");
}

function onEthereumDisconnecting(signal, ethereumConnection) {
    // log.info(`*** EthereumConnection received ${signal}. Stopping.`);
}

function onEthereumDisconnected(event, ethereumConnection) {
    // log.info("Ethereum disconnected");
}

/********* TickerProvider event handlers *****************/

function onTickerConnecting(data, tickerProvider) {
    //log.debug(tickerProvider.name, "connecting.", data);
}

function onTickerConnected(data, tickerProvider) {
    log.info(`${tickerProvider.name} connected at ${data.url} httpPollInterval: ${data.httpPollInterval}`);
}

function onTickerDisconnecting(signal, tickerProvider) {
    // log.info(`*** ${tickerProvider.name} received ${signal}. Disconnecting.`);
}

function onTickerDisconnected(tickerProvider) {
    // log.info(tickerProvider.name, "disconnected.");
}

function onTickerReceived(newTicker, tickerProvider) {
    //log.debug(tickerProvider.name, "ticker received", JSON.stringify(newTicker));
}

function onTickerUpdated(newTicker, prevTicker, tickerProvider) {
    // log.debug(tickerProvider.name, "ticker updated", JSON.stringify(newTicker), JSON.stringify(prevTicker));
}

function onTickerPriceChanged(newTicker, prevTicker, tickerProvider) {
    // log.debug(tickerProvider.name, "ticker price changed", JSON.stringify(newTicker), JSON.stringify(prevTicker));
}

function onTickerProviderError(error, tickerProvider) {
    // NB: unique errors are logged from module with log.error
    log.debug(tickerProvider.name, "providerError", error);
}
