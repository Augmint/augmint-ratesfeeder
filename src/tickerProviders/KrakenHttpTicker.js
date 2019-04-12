/* Kraken HTTP API:  https://www.kraken.com/features/api#get-ticker-info

 NB: Kraken's websocket has vwaps for different time periods than 24hrs
*/

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

        const tickerData = {
            vwap: parseFloat(data.p[1]), // p[1] is Last 24 hours volume weighted average price.
            lastTradePrice: parseFloat(data.c[0])
            // NB: Kraken doesn't return timestamp of data so it will be set to fetch initiation time by super.poll()
        };

        return tickerData;
    }
}

module.exports = KrakenHttpTicker;
