require("./env.js");
const ulog = require("ulog");
const log = ulog("runFeeder");
const RatesFeeder = require("../src/RatesFeeder.js");
const subscribeTickers = require("../src/subscribeTickers.js");
const statusApi = require("../src/statusApi/server.js");

log.info(
    `** runFeeder starting with settings:
    NODE_ENV: ${process.env.NODE_ENV}
    LOG: ${process.env.LOG}`
);

const ratesFeeder = new RatesFeeder(subscribeTickers.tickers);
statusApi.start(ratesFeeder);

ratesFeeder
    .init()

    .then(() => {
        subscribeTickers.connectAll();

        subscribeTickers.tickers.forEach(tickerProvider => {
            // tickerProvider.on("pricechange", onTickerPriceChange);
            // tickerProvider.on("trade", onTickerTrade);
            // tickerProvider.on("disconnecting", onTickerDisconnecting);
            tickerProvider.on("heartbeattimeout", onTickerHeartbeatTimeout);
        });

        // function onTickerDisconnecting(tickerProvider) {
        //     log.debug(tickerProvider.name, "disconnecting.", "WebSocket readyState: ", tickerProvider.ws.readyState);
        // }

        function onTickerHeartbeatTimeout(ticker) {
            log.warn(ticker.name, "heartbeat timed out. Reconnecting.");
        }

        // function onTickerPriceChange(newTicker, prevTicker, ticker) {
        //     log.log("onTickerPriceChange", ticker.name, "\t", JSON.stringify(newTicker), JSON.stringify(prevTicker));
        // }
        //
        // function onTickerTrade(newTicker, prevTicker, tickerProvider) {
        //     log.debug("onTickerTrade", tickerProvider.name, "\t", JSON.stringify(newTicker), JSON.stringify(prevTicker));
        // }
    })
    .catch(error => {
        log.error("Error: Can't init ratesFeeder. Details:\n", error);
        process.exit(1);
    });
