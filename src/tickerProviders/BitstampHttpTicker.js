/* Bitstamp HTTP API:  https://www.bitstamp.net/api/
 We return vwap as price - bitstamp returns last 24hrs vwap in ticker
 additional we include lastPrice
*/

//const log = require("src/log.js")("TickerProvider");
const BaseHttpTickerProvider = require("./BaseHttpTickerProvider.js");

class BitstampHttpTicker extends BaseHttpTickerProvider {
    constructor(_config) {
        const config = Object.assign({ url: "https://www.bitstamp.net/api/v2/ticker/etheur" }, _config);
        super(config);
    }

    get name() {
        return "Bitstamp";
    }

    processTickerData(data) {
        // https://www.bitstamp.net/api/
        const tickerData = {
            price: parseFloat(data.vwap), // Last 24 hours volume weighted average price.
            time: new Date(parseInt(data.timestamp) * 1000),
            lastTradePrice: parseFloat(data.last)
        };
        return tickerData;
    }
}

module.exports = BitstampHttpTicker;
