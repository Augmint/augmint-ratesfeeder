const ratesFeeder = require("../src/RatesFeeder.js");
const subscribeTickers = require("../src/subscribeTickers.js");

ratesFeeder
    .init(subscribeTickers.tickers)

    .then(() => {
        subscribeTickers.connectAll();

        subscribeTickers.tickers.forEach(ticker => {
            // ticker.on("pricechange", onTickerPriceChange);
            // ticker.on("trade", onTickerTrade);
            ticker.on("disconnect", onTickerDisconnect);
            ticker.on("heartbeattimeout", onTickerHeartbeatTimeout);
        });

        function onTickerDisconnect(ticker) {
            console.log(ticker.name, "disconnecting.", "WebSocket readyState: ", this.ws.readyState);
        }

        function onTickerHeartbeatTimeout(ticker) {
            console.log(ticker.name, "heartbeat timed out. Reconnecting.");
        }

        // function onTickerPriceChange(lastTrade, prevTrade, ticker) {
        //     console.log("onTickerPriceChange", ticker.name, "\t", JSON.stringify(lastTrade), JSON.stringify(prevTrade));
        // }
        //
        // function onTickerTrade(lastTrade, prevTrade, ticker) {
        //      console.log("onTickerTrade", ticker.name, "\t", JSON.stringify(lastTrade), JSON.stringify(prevTrade));
        // }
    })
    .catch(error => {
        console.error("Error: Can't init ratesFeeder. Details:\n", error);
        process.exit(1);
    });
