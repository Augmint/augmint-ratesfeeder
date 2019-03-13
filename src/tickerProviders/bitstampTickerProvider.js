/* BitStamp - subscription via Pusher
 https://www.bitstamp.net/websocket/
 https://docs.pro.coinbase.com/?r=1#the-ticker-channel
*/
const WebsocketTicker = require("./WebsocketTicker.js");

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
    }
};

module.exports = { definition };
