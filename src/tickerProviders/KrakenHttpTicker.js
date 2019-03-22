/* Kraken HTTP API:  https://www.kraken.com/features/api#get-ticker-info
 We return vwap as price - Kraken returns last 24hrs vwap in ticker
 Additionally we include lastPrice.
 NB: Kraken's websocket has vwap, that could be used instead of http polling
*/

const log = require("src/log.js")("TickerProvider");
const BaseHttpTickerProvider = require("./BaseHttpTickerProvider.js");

class KrakenHttpTicker extends BaseHttpTickerProvider {
    constructor(_config) {
        const config = Object.assign({ url: "https://api.kraken.com/0/public/Ticker?pair=etheur" }, _config);
        super(config);
    }

    get name() {
        return "Kraken";
    }

    processTickerData(_data) {
        // https://www.kraken.com/features/api#get-ticker-info
        if (_data.error.length !== 0) {
            throw "Kraken returned error: " + _data.error;
        }
        const data = _data.result.XETHZEUR;

        // p[1] is Last 24 hours volume weighted average price.
        // NB: Kraken doesn't return timestamp of data so it will be set to fetch initiation time by super.poll()
        const tickerData = { price: parseFloat(data.p[1]), lastTradePrice: parseFloat(data.c[0]) };

        return tickerData;
    }
}

module.exports = KrakenHttpTicker;
