/* TODO:
 - write integration tests
 - implement a 3rd tickerprovider, eg. bitstamp? https://www.bitstamp.net/websocket/
 */

const WebsocketTicker = require("./tickerProviders/WebsocketTicker.js");

const gdaxTickerProvider = require("./tickerProviders/gdaxTickerProvider.js");
const krakenTickerProvider = require("./tickerProviders/krakenTickerProvider.js");
// Not using bitfinex as price is out by ca. 3% https://www.reddit.com/r/CryptoCurrency/comments/abvbwd/why_is_btc_price_on_bitfinex_so_much_higher_than/
//const bitfinexTickerProvider = require("./tickerProviders/bitfinexTickerProvider.js");

const tickers = [
    new WebsocketTicker(krakenTickerProvider.definition),
    new WebsocketTicker(gdaxTickerProvider.definition)
    //,    new WebsocketTicker(bitfinexTickerProvider.definition)
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