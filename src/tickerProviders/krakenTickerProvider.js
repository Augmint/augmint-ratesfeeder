/* Kraken
 https://www.kraken.com/features/websocket-api
  https://www.kraken.com/features/websocket-api#message-ticker
  https://www.kraken.com/features/api#get-ticker-info
*/
const fetch = require("node-fetch");
const WebsocketTicker = require("./WebsocketTicker.js");

// used for initial fetch because kraken doesn't return snapshot when first subscribed.
// Ie. we need to fetch trades after connection to update lastTicker otherwise we would only have price after a trade
const KRAKEN_HTTP_URL = "https://api.kraken.com/0/public/Ticker?pair=ETHEUR";

const definition = {
    NAME: "KRAKEN",
    WSS_URL: "wss://ws.kraken.com",
    SUBSCRIBE_PAYLOAD: {
        event: "subscribe",
        pair: ["ETH/EUR"],
        subscription: {
            name: "ticker"
        }
    },
    UNSUBSCRIBE_PAYLOAD: {
        event: "unsubscribe",
        pair: ["ETH/EUR"],
        subscription: {
            name: "ticker"
        }
    },

    processMessage: msg => {
        const data = JSON.parse(msg.data);
        switch (data.event) {
        case "systemStatus":
            return { type: WebsocketTicker.MESSAGE_TYPES.CONNECTED, data };
        case "subscriptionStatus":
            if (data.status === "subscribed") {
                return { type: WebsocketTicker.MESSAGE_TYPES.SUBSCRIBED, data };
            } else if (data.status === "unsubscribed") {
                return { type: WebsocketTicker.MESSAGE_TYPES.UNSUBSCRIBED, data };
            } else {
                return { type: WebsocketTicker.MESSAGE_TYPES.UNKNOWN, data };
            }
        case "heartbeat":
            return { type: WebsocketTicker.MESSAGE_TYPES.HEARTBEAT, data };
        default:
            if ("event" in data) {
                return { type: WebsocketTicker.MESSAGE_TYPES.UNKNOWN, data };
            } else {
                // It's a ticker because no event prop present
                // https://www.kraken.com/features/websocket-api#message-ticker
                return {
                    type: WebsocketTicker.MESSAGE_TYPES.TRADE,
                    data: { price: parseFloat(data[1].c[0]), volume: parseFloat(data[1].c[1]), time: new Date() } // Kraken doesn't return trade time nor seq
                };
            }
        }
    },

    fetchCurrentTicker: async () => {
        const res = await fetch(KRAKEN_HTTP_URL);
        const data = (await res.json()).result.XETHZEUR;

        // https://www.kraken.com/features/api#get-ticker-info
        const tickerData = { price: parseFloat(data.c[0]), volume: parseFloat(data.c[1]), time: new Date() };
        return tickerData;
    }
};

module.exports = { definition };
