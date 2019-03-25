const CoinbaseTickerProvider = require("src/tickerProviders/CoinbaseHttpTicker.js");
const KrakenTickerProvider = require("src/tickerProviders/KrakenHttpTicker.js");
const BitstampTickerProvider = require("src/tickerProviders/BitstampHttpTicker.js");

const tickers = [
    new CoinbaseTickerProvider(), //
    new KrakenTickerProvider(), //
    new BitstampTickerProvider() //
];

async function connectAll() {
    await Promise.all(tickers.map(ticker => ticker.connect()));
}

module.exports = {
    get tickers() {
        return tickers;
    },
    connectAll
};
