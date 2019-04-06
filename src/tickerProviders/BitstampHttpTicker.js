/* Bitstamp HTTP API:  https://www.bitstamp.net/api/
 */

//const log = require("src/augmintjs/helpers/log.js")("TickerProvider");
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
            vwap: parseFloat(data.vwap), // // Last 24 hours volume weighted average price.
            time: new Date(parseInt(data.timestamp) * 1000),
            lastTradePrice: parseFloat(data.last)
        };
        return tickerData;
    }
}

module.exports = BitstampHttpTicker;
