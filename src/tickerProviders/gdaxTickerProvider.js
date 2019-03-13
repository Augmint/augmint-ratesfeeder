/* GDAX  (aka coinbase pro)
 https://docs.pro.coinbase.com/#get-product-ticker
 https://docs.pro.coinbase.com/?r=1#the-ticker-channel
*/
const WebsocketTicker = require("./WebsocketTicker.js");

const definition = {
    NAME: "GDAX",
    WSS_URL: "wss://ws-feed.pro.coinbase.com",
    SUBSCRIBE_PAYLOAD: {
        type: "subscribe",
        product_ids: ["ETH-EUR"],
        channels: ["ticker", "heartbeat"]
    },
    UNSUBSCRIBE_PAYLOAD: {
        type: "unsubscribe",
        product_ids: ["ETH-EUR"], // w/o prod ids it would unsubscribe from all products
        channels: ["ticker", "heartbeat"]
    },

    processMessage: msg => {
        const data = JSON.parse(msg.data);
        switch (data.type) {
        case "error":
            return { type: WebsocketTicker.MESSAGE_TYPES.ERROR, data };

        case "ticker": {
            // GDAX returns a price without volume & time right after subscribe
            const volume = data.last_size ? parseFloat(data.last_size) : null;
            const time = data.time ? new Date(data.time) : new Date();

            return {
                type: WebsocketTicker.MESSAGE_TYPES.TRADE,
                data: {
                    price: parseFloat(data.price),
                    volume,
                    time,
                    tradeId: parseInt(data.trade_id)
                }
            };
        }

        case "subscriptions":
            if (data.channels && data.channels.length > 0) {
                return { type: WebsocketTicker.MESSAGE_TYPES.SUBSCRIBED, data };
            } else {
                return { type: WebsocketTicker.MESSAGE_TYPES.UNSUBSCRIBED, data };
            }

        case "heartbeat":
            return { type: WebsocketTicker.MESSAGE_TYPES.HEARTBEAT, data };

        default:
            return { type: WebsocketTicker.MESSAGE_TYPES.UNKNOWN, data };
        }
    }
};

module.exports = { definition };
