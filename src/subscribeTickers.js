/* TODO:
 - write integration tests
  */

const TickerProvider = require("src/tickerProviders/TickerProvider.js");

const gdaxTickerProvider = require("src/tickerProviders/gdaxTickerProvider.js");
const krakenTickerProvider = require("src/tickerProviders/krakenTickerProvider.js");
const bitstampTickerProvider = require("src/tickerProviders/bitstampTickerProvider.js");
// Not using bitfinex as price is out by ca. 3% https://www.reddit.com/r/CryptoCurrency/comments/abvbwd/why_is_btc_price_on_bitfinex_so_much_higher_than/
//const bitfinexTickerProvider = require("./tickerProviders/bitfinexTickerProvider.js");

const tickers = [
    new TickerProvider(krakenTickerProvider.definition),
    new TickerProvider(gdaxTickerProvider.definition),
    new TickerProvider(bitstampTickerProvider.definition)
    //,    new TickerProvider(bitfinexTickerProvider.definition)
];

function connectAll() {
    tickers.forEach(ticker => ticker.connectAndSubscribe());
}

module.exports = {
    get tickers() {
        return tickers;
    },
    connectAll
};
