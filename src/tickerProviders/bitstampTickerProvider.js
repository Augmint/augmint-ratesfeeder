/* BitStamp - subscription via Pusher
 https://www.bitstamp.net/websocket/
 https://docs.pro.coinbase.com/?r=1#the-ticker-channel
*/
const fetch = require("node-fetch");
const WebsocketTicker = require("./WebsocketTicker.js");

// used for initial fetch because kraken doesn't return snapshot when first subscribed.
// Ie. we need to fetch trades after connection to update lastTicker otherwise we would only have price after a trade
const BITSTAMP_HTTP_URL = "https://www.bitstamp.net/api/v2/ticker/etheur";

const definition = {
    NAME: "BITSTAMP",
    PUSHER_APP_KEY: "de504dc5763aeef9ff52",
    PUSHER_CHANNEL_NAME: "live_trades_etheur", // live_trades_etheur
    PUSHER_CHANNEL_EVENT_NAME: "trade",
    // HEARTBEAT_TIMEOUT: null, // WebsocketTicker sets it to pusherSocket.config.activity_timeout + 60s
    // WSS_URL: null,
    // SUBSCRIBE_PAYLOAD: null,
    // UNSUBSCRIBE_PAYLOAD: null,

    processMessage: msg => {
        return {
            type: WebsocketTicker.MESSAGE_TYPES.TRADE,
            data: {
                price: parseFloat(msg.price),
                volume: msg.amount,
                time: new Date(parseInt(msg.microtimestamp) / 1000),
                tradeId: parseInt(msg.id)
            }
        };
    },

    fetchCurrentTicker: async () => {
        const res = await fetch(BITSTAMP_HTTP_URL);
        const data = await res.json();

        // https://www.bitstamp.net/api/
        const tickerData = {
            price: parseFloat(data.last),
            /* volume is not returned volume: null ,*/ time: new Date(parseInt(data.timestamp) * 1000)
        };
        return tickerData;
    }
};

module.exports = { definition };
