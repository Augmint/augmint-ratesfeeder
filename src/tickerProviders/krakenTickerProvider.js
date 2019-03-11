/* Kraken
 https://www.kraken.com/features/websocket-api
  https://www.kraken.com/features/websocket-api#message-ticker

  NB: kraken doesn't return snapshot when first subscribed. Ie. lastTrade will only be updated when first trade happens.
    potential solution is to use OHLC subscription but that doesn't return last trade volume & time. could subscribe / unsubscribe at connect...
    see: https://www.kraken.com/features/websocket-api#message-ohlc
*/
const WebsocketTicker = require("./WebsocketTicker.js");

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

    processMessage: (msg, data) => {
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
    }
};

module.exports = { definition };