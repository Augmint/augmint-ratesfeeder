/* Coinbase HTTP API:  https://docs.pro.coinbase.com/#get-product-ticker

 NB: Coinbase can't provide vwap
*/

const BaseHttpTickerProvider = require("./BaseHttpTickerProvider.js");

class CoinbaseHttpTicker extends BaseHttpTickerProvider {
    constructor(_config) {
        const config = Object.assign({ url: "https://api.pro.coinbase.com/products/eth-eur/ticker" }, _config);
        super(config);
    }

    get name() {
        return "Coinbase";
    }

    processTickerData(data) {
        // https://docs.pro.coinbase.com/#get-product-ticker

        const tickerData = {
            vwap: null, // no vwap from coinbase
            lastTradePrice: parseFloat(data.price),
            time: new Date(data.time)
        };

        return tickerData;
    }
}

module.exports = CoinbaseHttpTicker;
