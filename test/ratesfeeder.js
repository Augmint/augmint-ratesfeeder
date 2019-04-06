/* test of RatesFeeder with mocked ratesProviders
 */
const assert = require("chai").assert;
const baseHelpers = require("./helpers/base.js");

const CCY = "EUR";
let BYTES_CCY;

const getStatus = () => "tickerProvider mock getStatus for test";

let ratesFeeder;

describe("RatesFeeder: real exchange rate tests", () => {
    before(async () => {
        ratesFeeder = await baseHelpers.ratesFeeder();

        BYTES_CCY = baseHelpers.web3.utils.asciiToHex(CCY);
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

    it("ratesFeeder should return null median price when all tickers null or zero )", () => {
        const tickers = [
            { lastTicker: { lastTradePrice: 0, vwap: 13 } },
            { lastTicker: { lastTradePrice: null, vwap: 13 } },
            { lastTicker: { lastTradePrice: 0, vwap: 13 } }
        ];
        const expectedPrice = null;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should set the price on-chain from tickers when diff > threshold ", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();

        ratesFeeder.tickers = [
            {
                name: "testTicker1",
                lastTicker: { lastTradePrice: 657.62, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            },
            {
                name: "testTicker2",
                lastTicker: { lastTradePrice: 659.52, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            },
            {
                name: "testTicker3",
                lastTicker: { lastTradePrice: 659.2, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            }
        ];

        const expectedPrice = 659.2;
        const prevStoredRate = await ratesFeeder.rates.getAugmintRate(CCY);

        // test sanity checks:
        assert.notEqual(prevStoredRate.rate, expectedPrice);
        assert(
            (Math.abs(expectedPrice - prevStoredRate.rate) / prevStoredRate.rate) * 100 >
                process.env.RATESFEEDER_LIVE_PRICE_THRESHOLD_PT
        );

        await ratesFeeder.checkTickerPrice();

        await baseHelpers.assertEvent(ratesFeeder.rates.instance, "RateChanged", {
            symbol: BYTES_CCY.padEnd(66, "0"),
            newRate: (expectedPrice * 10 ** ratesFeeder.decimals).toString()
        });

        const newStoredRate = await ratesFeeder.rates.getAugmintRate(CCY);

        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePrice, expectedPrice);
        // lastTickerCheckResult format: { CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // currentAugmintRate shouldn't be updated yet (checkTickerPrice sends setRate async, currentAugmintRate updated
        //                                              only after tx confirmation when checkTickerPrice called again)
        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.rate, prevStoredRate.rate);
        assert.deepEqual(
            new Date(ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated),
            prevStoredRate.lastUpdated
        );

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, expectedPrice);

        ratesFeeder.tickers = origtickers;
    });

    it("ratesFeeder should NOT set the price on-chain from tickers when diff < threshold ", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();
        const prevStoredRate = await ratesFeeder.rates.getAugmintRate(CCY);

        const expectedLivePriceDifference = process.env.RATESFEEDER_LIVE_PRICE_THRESHOLD_PT / 100 - 0.0001;
        const newLivePrice = parseFloat((prevStoredRate.rate * (1 + expectedLivePriceDifference)).toFixed(2));

        ratesFeeder.tickers = [
            {
                name: "testTicker1",
                lastTicker: { lastTradePrice: newLivePrice, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            },
            {
                name: "testTicker2",
                lastTicker: { lastTradePrice: newLivePrice, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            },
            {
                name: "testTicker3",
                lastTicker: { lastTradePrice: newLivePrice, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            }
        ];

        await ratesFeeder.checkTickerPrice();

        const newStoredRate = await ratesFeeder.rates.getAugmintRate(CCY);
        //  events from previous tests are clashing with it - wether change helper funciotn or create and restore ganache snapshot after each test
        // await baseHelpers.assertNoEvents(ratesFeeder.augmintRatesInstance, "RateChanged");

        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePrice, newLivePrice);
        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePriceDifference, expectedLivePriceDifference);
        // lastTickerCheckResult format: { CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // currentAugmintRate shouldn't be updated yet (checkTickerPrice sends setRate async, currentAugmintRate updated
        //                                              only after tx confirmation when checkTickerPrice called again)
        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.rate, prevStoredRate.rate);
        assert.deepEqual(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated,
            prevStoredRate.lastUpdated
        );

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, prevStoredRate.rate);
        assert.deepEqual(newStoredRate.lastUpdated, prevStoredRate.lastUpdated);

        ratesFeeder.tickers = origtickers;
    });

    it("ratesFeeder should NOT set the price on-chain from tickers when all tickers are down", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();

        ratesFeeder.tickers = [
            {
                name: "testTicker1",
                lastTicker: { lastTradePrice: null, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            },
            {
                name: "testTicker2",
                lastTicker: { lastTradePrice: 0, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            },
            {
                name: "testTicker3",
                lastTicker: { lastTradePrice: null, vwap: 13, receivedAt: expectedCheckedAt },
                getStatus
            }
        ];

        const prevStoredRate = await ratesFeeder.rates.getAugmintRate(CCY);

        await ratesFeeder.checkTickerPrice();

        const newStoredRate = await ratesFeeder.rates.getAugmintRate(CCY);
        //  events from previous tests are clashing with it - wether change helper funciotn or create and restore ganache snapshot after each test
        // await baseHelpers.assertNoEvents(ratesFeeder.augmintRatesInstance, "RateChanged");

        assert.isNull(ratesFeeder.lastTickerCheckResult[CCY].livePrice);
        assert.isNull(ratesFeeder.lastTickerCheckResult[CCY].livePriceDifference);
        // lastTickerCheckResult format: { CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // currentAugmintRate shouldn't be updated yet (checkTickerPrice sends setRate async, currentAugmintRate updated
        //                                              only after tx confirmation when checkTickerPrice called again)
        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.rate, prevStoredRate.rate);
        assert.deepEqual(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated,
            prevStoredRate.lastUpdated
        );

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, prevStoredRate.rate);
        assert.deepEqual(newStoredRate.lastUpdated, prevStoredRate.lastUpdated);

        ratesFeeder.tickers = origtickers;
    });

    it("set on-chain rate and should be the same", async () => {
        const price = 213.14;

        await ratesFeeder.updatePrice(CCY, price);

        await baseHelpers.assertEvent(ratesFeeder.rates.instance, "RateChanged", {
            symbol: BYTES_CCY.padEnd(66, "0"),
            newRate: (price * 10 ** ratesFeeder.decimals).toString()
        });

        const storedRate = await ratesFeeder.rates.getAugmintRate(CCY);

        assert.equal(storedRate.rate, price);
    });

    it("should recover after web3 connection lost");
});
