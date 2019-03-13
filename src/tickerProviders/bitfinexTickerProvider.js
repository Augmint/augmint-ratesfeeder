/* BITFINEX
https://docs.bitfinex.com/docs/ws-general
https://docs.bitfinex.com/v2/reference#ws-public-trades

NB: not used b/c bitfinex price is out by ca. 3% https://www.reddit.com/r/CryptoCurrency/comments/abvbwd/why_is_btc_price_on_bitfinex_so_much_higher_than/
*/
const WebsocketTicker = require("./WebsocketTicker.js");

const definition = {
    NAME: "BITFINEX",
    WSS_URL: "wss://api-pub.bitfinex.com/ws/2",
    SUBSCRIBE_PAYLOAD: {
        event: "subscribe",
        channel: "trades", // we use trades channgel b/c ticker channel doesn't return last trade's volume & time
        pair: "ETHEUR"
    },
    UNSUBSCRIBE_PAYLOAD: {
        event: "unsubscribe"
        // chanId: <chanId> // it will be filled with channelID prop saved from subscribe response
    },
    PING_INTERVAL: 10000, // Bitfinex api disconnects after x seconds if we don't keep pinging...
    PING_PAYLOAD: {
        // only required if PING_INTERVAL is not null
        event: "ping",
        cid: new Date()
    },

    processMessage: msg => {
        function parseBitFinexTrade(tradeData) {
            return {
                price: tradeData[3],
                volume: Math.abs(tradeData[2]),
                time: new Date(tradeData[1]),
                tradeId: tradeData[0]
            };
        }
        const data = JSON.parse(msg.data);
        switch (data.event) {
        case "info":
            return { type: WebsocketTicker.MESSAGE_TYPES.CONNECTED, data };
        case "subscribed":
            return { type: WebsocketTicker.MESSAGE_TYPES.SUBSCRIBED, data };
        case "unsubscribed":
            return { type: WebsocketTicker.MESSAGE_TYPES.UNSUBSCRIBED, data };
        case "pong":
            return { type: WebsocketTicker.MESSAGE_TYPES.PONG, data };
        default:
            if (data[1] === "hb") {
                return { type: WebsocketTicker.MESSAGE_TYPES.HEARTBEAT, data };
            } else if (data[1] === "tu") {
                // confirmed trade with tradeid
                // https://docs.bitfinex.com/v2/reference#ws-public-trades
                return {
                    type: WebsocketTicker.MESSAGE_TYPES.TRADE,
                    data: parseBitFinexTrade(data[2])
                };
            } else if (Number.isInteger(data[0]) && Array.isArray(data[1]) && Array.isArray(data[1][0])) {
                // snapshot returns multiple trades (https://docs.bitfinex.com/docs/ws-general#section-snapshot)
                // trades seems to be ordered by tradeId (i.e. data[1][0] is the last trade) but to be sure we look for the latest tradeid because it's undocumented
                const lastTradeId = Math.max.apply(Math, data[1].map(o => o[0]));
                const lastTrade = data[1].find(o => o[0] === lastTradeId);
                return {
                    type: WebsocketTicker.MESSAGE_TYPES.TRADE,
                    data: parseBitFinexTrade(lastTrade)
                };
            } else if (data[1] === "te") {
                // trade update: "te" (executon) -  comes before tu (confirmed trade  w tradeid).
                // we igndore it
                return { type: WebsocketTicker.MESSAGE_TYPES.IGNORE, data };
            } else {
                return { type: WebsocketTicker.MESSAGE_TYPES.UNKNOWN, data };
            }
        }
    }
};

module.exports = { definition };
