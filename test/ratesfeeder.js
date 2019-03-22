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
            { lastTicker: { price: 187.73 } },
            { lastTicker: { price: 186.73 } },
            { lastTicker: { price: 187.3 } },
            getStatus
        ];
        const expectedPrice = 187.3;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of all tickers (flash crash)", () => {
        const tickers = [
            { lastTicker: { price: 170.81 } },
            { lastTicker: { price: 171.06 } },
            { lastTicker: { price: 0.1 } },
            getStatus
        ];
        const expectedPrice = 170.81;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of live tickers (1 ticker null)", () => {
        const tickers = [
            { lastTicker: { price: 176.79 } },
            { lastTicker: { price: null } },
            { lastTicker: { price: 176.99 } },
            getStatus
        ];
        const expectedPrice = 176.89;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of live tickers (2 ticker null/0)", () => {
        const tickers = [
            { lastTicker: { price: 641.12 } },
            { lastTicker: { price: null } },
            { lastTicker: { price: 0 } },
            getStatus
        ];
        const expectedPrice = 641.12;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return null median price when all tickers null or zero )", () => {
        const tickers = [{ lastTicker: { price: 0 } }, { lastTicker: { price: null } }, { lastTicker: { price: 0 } }];
        const expectedPrice = null;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should set the price on-chain from tickers when diff > threshold ", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();

        ratesFeeder.tickers = [
            { name: "testTicker1", lastTicker: { price: 657.62, receivedAt: expectedCheckedAt }, getStatus },
            { name: "testTicker2", lastTicker: { price: 659.52, receivedAt: expectedCheckedAt }, getStatus },
            { name: "testTicker3", lastTicker: { price: 659.2, receivedAt: expectedCheckedAt }, getStatus }
        ];

        const expectedPrice = 659.2;
        const prevStoredRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();

        // test sanity checks:
        assert.notEqual(prevStoredRate.rate, expectedPrice);
        assert(
            (Math.abs(expectedPrice - prevStoredRate.rate) / prevStoredRate.rate) * 100 >
                process.env.LIVE_PRICE_THRESHOLD_PT
        );

        await ratesFeeder.checkTickerPrice();

        await baseHelpers.assertEvent(ratesFeeder.augmintRatesInstance, "RateChanged", {
            symbol: BYTES_CCY.padEnd(66, "0"),
            newRate: (expectedPrice * ratesFeeder.decimalsDiv).toString()
        });

        const newStoredRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();

        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePrice, expectedPrice);
        // lastTickerCheckResult format: { CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // currentAugmintRate shouldn't be updated yet (checkTickerPrice sends setRate async, currentAugmintRate updated
        //                                              only after tx confirmation when checkTickerPrice called again)
        assert.equal(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.price,
            prevStoredRate.rate / ratesFeeder.decimalsDiv
        );
        assert.equal(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated / 1000,
            prevStoredRate.lastUpdated
        );

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, expectedPrice * ratesFeeder.decimalsDiv);

        ratesFeeder.tickers = origtickers;
    });

    it("ratesFeeder should NOT set the price on-chain from tickers when diff < threshold ", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();
        const prevStoredRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();
        const expectedLivePriceDifference = (process.env.LIVE_PRICE_THRESHOLD_PT - 0.1) / 100;
        const newLivePrice = parseFloat(
            ((prevStoredRate.rate / ratesFeeder.decimalsDiv) * (1 + expectedLivePriceDifference)).toFixed(2)
        );

        ratesFeeder.tickers = [
            { name: "testTicker1", lastTicker: { price: newLivePrice, receivedAt: expectedCheckedAt }, getStatus },
            { name: "testTicker2", lastTicker: { price: newLivePrice, receivedAt: expectedCheckedAt }, getStatus },
            { name: "testTicker3", lastTicker: { price: newLivePrice, receivedAt: expectedCheckedAt }, getStatus }
        ];

        await ratesFeeder.checkTickerPrice();

        const newStoredRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();
        //  events from previous tests are clashing with it - wether change helper funciotn or create and restore ganache snapshot after each test
        // await baseHelpers.assertNoEvents(ratesFeeder.augmintRatesInstance, "RateChanged");

        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePrice, newLivePrice);
        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePriceDifference, expectedLivePriceDifference);
        // lastTickerCheckResult format: { CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // currentAugmintRate shouldn't be updated yet (checkTickerPrice sends setRate async, currentAugmintRate updated
        //                                              only after tx confirmation when checkTickerPrice called again)
        assert.equal(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.price,
            prevStoredRate.rate / ratesFeeder.decimalsDiv
        );
        assert.equal(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated / 1000,
            prevStoredRate.lastUpdated
        );

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, prevStoredRate.rate);
        assert.equal(newStoredRate.lastUpdated, prevStoredRate.lastUpdated);

        ratesFeeder.tickers = origtickers;
    });

    it("ratesFeeder should NOT set the price on-chain from tickers when all tickers are down", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();

        ratesFeeder.tickers = [
            { name: "testTicker1", lastTicker: { price: null, receivedAt: expectedCheckedAt }, getStatus },
            { name: "testTicker2", lastTicker: { price: 0, receivedAt: expectedCheckedAt }, getStatus },
            { name: "testTicker3", lastTicker: { price: null, receivedAt: expectedCheckedAt }, getStatus }
        ];

        const prevStoredRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();

        await ratesFeeder.checkTickerPrice();

        const newStoredRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();
        //  events from previous tests are clashing with it - wether change helper funciotn or create and restore ganache snapshot after each test
        // await baseHelpers.assertNoEvents(ratesFeeder.augmintRatesInstance, "RateChanged");

        assert.isNull(ratesFeeder.lastTickerCheckResult[CCY].livePrice);
        assert.isNull(ratesFeeder.lastTickerCheckResult[CCY].livePriceDifference);
        // lastTickerCheckResult format: { CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // currentAugmintRate shouldn't be updated yet (checkTickerPrice sends setRate async, currentAugmintRate updated
        //                                              only after tx confirmation when checkTickerPrice called again)
        assert.equal(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.price,
            prevStoredRate.rate / ratesFeeder.decimalsDiv
        );
        assert.equal(
            ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated / 1000,
            prevStoredRate.lastUpdated
        );

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, prevStoredRate.rate);
        assert.equal(newStoredRate.lastUpdated, prevStoredRate.lastUpdated);

        ratesFeeder.tickers = origtickers;
    });

    it("set on-chain rate and should be the same", async () => {
        const price = 213.14;

        await ratesFeeder.updatePrice(CCY, price);

        await baseHelpers.assertEvent(ratesFeeder.augmintRatesInstance, "RateChanged", {
            symbol: BYTES_CCY.padEnd(66, "0"),
            newRate: (price * ratesFeeder.decimalsDiv).toString()
        });

        const storedRate = await ratesFeeder.augmintRatesInstance.methods.rates(BYTES_CCY).call();

        assert.equal(storedRate.rate, Math.round(price * ratesFeeder.decimalsDiv));
    });
});
