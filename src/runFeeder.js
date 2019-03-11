require("./env.js");
const ulog = require("ulog");
const log = ulog("runFeeder");
const RatesFeeder = require("../src/RatesFeeder.js");
const subscribeTickers = require("../src/subscribeTickers.js");

log.info(
    `** runFeeder starting with settings:
    NODE_ENV: ${process.env.NODE_ENV}
    LOG: ${process.env.LOG}`
);

const ratesFeeder = new RatesFeeder(subscribeTickers.tickers);
ratesFeeder
    .init()

    .then(() => {
        subscribeTickers.connectAll();

        subscribeTickers.tickers.forEach(ticker => {
            // ticker.on("pricechange", onTickerPriceChange);
            // ticker.on("trade", onTickerTrade);
            // ticker.on("disconnecting", onTickerDisconnecting);
            ticker.on("heartbeattimeout", onTickerHeartbeatTimeout);
        });

        // function onTickerDisconnecting(ticker) {
        //     log.debug(ticker.name, "disconnecting.", "WebSocket readyState: ", this.ws.readyState);
        // }

        function onTickerHeartbeatTimeout(ticker) {
            log.warn(ticker.name, "heartbeat timed out. Reconnecting.");
        }

        // function onTickerPriceChange(lastTrade, prevTrade, ticker) {
        //     console.log("onTickerPriceChange", ticker.name, "\t", JSON.stringify(lastTrade), JSON.stringify(prevTrade));
        // }
        //
        // function onTickerTrade(lastTrade, prevTrade, ticker) {
        //     log.debug("onTickerTrade", ticker.name, "\t", JSON.stringify(lastTrade), JSON.stringify(prevTrade));
        // }
    })
    .catch(error => {
        console.error("Error: Can't init ratesFeeder. Details:\n", error);
        process.exit(1);
    });
