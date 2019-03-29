require("src/env.js");
const log = require("src/log.js")("runFeeder");
const ethereumConnection = require("src/ethereumConnection.js");
const RatesFeeder = require("src/RatesFeeder.js");
const subscribeTickers = require("src/subscribeTickers.js");
const statusApi = require("src/statusApi/server.js");

log.info(
    `** runFeeder starting with settings:
    NODE_ENV: ${process.env.NODE_ENV}
    LOG: ${process.env.LOG}`
);

const ratesFeeder = new RatesFeeder(ethereumConnection.web3, subscribeTickers.tickers);
statusApi.start(ratesFeeder);

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

            tickerProvider.on("providerError", onProviderError);
        });

        await subscribeTickers.connectAll();
    })
    .catch(error => {
        log.error("Error: Can't init ratesFeeder. Details:\n", error);
        process.exit(1);
    });

function onTickerConnecting(data, tickerProvider) {
    log.debug(tickerProvider.name, "connecting.", data);
}

function onTickerConnected(data, tickerProvider) {
    log.info(tickerProvider.name, "connected.", data);
}

function onTickerDisconnecting(tickerProvider) {
    //log.debug(tickerProvider.name, "disconnecting.");
}

function onTickerDisconnected(tickerProvider) {
    log.info(tickerProvider.name, "disconnected.");
}

function onTickerReceived(newTicker, tickerProvider) {
    //log.debug(tickerProvider.name, "ticker received", JSON.stringify(newTicker));
}

function onTickerUpdated(newTicker, prevTicker, tickerProvider) {
    log.debug(tickerProvider.name, "ticker updated", JSON.stringify(newTicker), JSON.stringify(prevTicker));
}

function onTickerPriceChanged(newTicker, prevTicker, tickerProvider) {
    log.debug(tickerProvider.name, "ticker price changed", JSON.stringify(newTicker), JSON.stringify(prevTicker));
}

function onProviderError(error, tickerProvider) {
    // NB: sever errors are logged from module with log.error
    log.debug(tickerProvider.name, "providerError", error);
}
