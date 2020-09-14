/* test of RatesFeeder onchain transactions
 */
const assert = require("chai").assert;
const baseHelpers = require("./helpers/base.js");
const EthereumConnection = require("@augmint/js/src/EthereumConnection.js");
const ethereumConnection = new EthereumConnection();
const RatesFeeder = require("src/RatesFeeder.js");

const CCY = "EUR";
let BYTES_CCY;

const getStatus = () => "tickerProvider mock getStatus for test";

let snapshotId;
let ratesFeeder;

describe("RatesFeeder: onchain tests", () => {
    before(async () => {
        await ethereumConnection.connect();

        ratesFeeder = new RatesFeeder(ethereumConnection, []);

        await ratesFeeder.init();

        BYTES_CCY = ethereumConnection.web3.utils.asciiToHex(CCY);
    });

    beforeEach(async () => {
        snapshotId = await baseHelpers.takeSnapshot(ethereumConnection.web3);
    });

    afterEach(async () => {
        await baseHelpers.revertSnapshot(ethereumConnection.web3, snapshotId);
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
