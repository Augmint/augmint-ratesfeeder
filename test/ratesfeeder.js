/* test of RatesFeeder with mocked ratesProviders
 */
const assert = require("chai").assert;
const RatesFeeder = require("src/RatesFeeder.js");
const EthereumConnection = require("@augmint/js/src/EthereumConnection.js");
const ethereumConnection = new EthereumConnection();

const getStatus = () => "tickerProvider mock getStatus for test";

let ratesFeeder;

describe("RatesFeeder: real exchange rate tests", () => {
    before(async () => {
        await ethereumConnection.connect();
        ratesFeeder = new RatesFeeder(ethereumConnection, []);
        await ratesFeeder.init();
    });

    it("ratesFeeder should return the median price of all tickers", () => {
        const tickers = [
            { lastTicker: { lastTradePrice: 187.73, vwap: 13 } },
            { lastTicker: { lastTradePrice: 186.73, vwap: 14 } },
            { lastTicker: { lastTradePrice: 187.3, vwap: 15 } },
            getStatus
        ];
        const expectedPrice = 187.3;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of all tickers (flash crash)", () => {
        const tickers = [
            { lastTicker: { lastTradePrice: 170.81, vwap: 13 } },
            { lastTicker: { lastTradePrice: 171.06, vwap: 13 } },
            { lastTicker: { lastTradePrice: 0.1, vwap: 13 } },
            getStatus
        ];
        const expectedPrice = 170.81;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of live tickers (1 ticker null)", () => {
        const tickers = [
            { lastTicker: { lastTradePrice: 176.79, vwap: 13 } },
            { lastTicker: { lastTradePrice: null, vwap: 13 } },
            { lastTicker: { lastTradePrice: 176.99, vwap: 13 } },
            getStatus
        ];
        const expectedPrice = 176.89;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of live tickers (2 ticker null/0)", () => {
        const tickers = [
            { lastTicker: { lastTradePrice: 641.12, vwap: 13 } },
            { lastTicker: { lastTradePrice: null, vwap: 13 } },
            { lastTicker: { lastTradePrice: 0, vwap: 13 } },
            getStatus
        ];
        const expectedPrice = 641.12;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return null median price when all tickers null or zero", () => {
        const tickers = [
            { lastTicker: { lastTradePrice: 0, vwap: 13 } },
            { lastTicker: { lastTradePrice: null, vwap: 13 } },
            { lastTicker: { lastTradePrice: 0, vwap: 13 } }
        ];
        const expectedPrice = null;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });
});
