/* test of RatesFeeder with mocked ratesProviders
    TODO: mock price info + test edge cases
*/
const assert = require("chai").assert;
const baseHelpers = require("./helpers/base.js");

const CCY = "EUR";
let BYTES_CCY;

let ratesFeeder;

describe("RatesFeeder: real exchange rate tests", () => {
    before(async () => {
        ratesFeeder = await baseHelpers.ratesFeeder();

        BYTES_CCY = baseHelpers.web3.utils.asciiToHex(CCY);
    });

    it("ratesFeeder should return the median price of all tickers", () => {
        const tickers = [
            { lastTrade: { price: 187.73 } },
            { lastTrade: { price: 186.73 } },
            { lastTrade: { price: 187.3 } }
        ];
        const expectedPrice = 187.3;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of all tickers (flash crash)", () => {
        const tickers = [
            { lastTrade: { price: 170.81 } },
            { lastTrade: { price: 171.06 } },
            { lastTrade: { price: 0.1 } }
        ];
        const expectedPrice = 170.81;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of live tickers (1 ticker null)", () => {
        const tickers = [
            { lastTrade: { price: 176.79 } },
            { lastTrade: { price: null } },
            { lastTrade: { price: 176.99 } }
        ];
        const expectedPrice = 176.89;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return the median price of live tickers (2 ticker null/0)", () => {
        const tickers = [{ lastTrade: { price: 641.12 } }, { lastTrade: { price: null } }, { lastTrade: { price: 0 } }];
        const expectedPrice = 641.12;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should return null median price when all tickers null or zero )", () => {
        const tickers = [{ lastTrade: { price: 0 } }, { lastTrade: { price: null } }, { lastTrade: { price: 0 } }];
        const expectedPrice = null;
        const price = ratesFeeder.calculateAugmintPrice(tickers);
        assert.equal(price, expectedPrice);
    });

    it("ratesFeeder should set the price on-chain from tickers when diff > threshold ", async () => {
        const origtickers = ratesFeeder.tickers;
        const expectedCheckedAt = new Date();

        ratesFeeder.tickers = [
            { name: "testTicker1", lastTrade: { price: 657.62, time: expectedCheckedAt } },
            { name: "testTicker2", lastTrade: { price: 659.52, time: expectedCheckedAt } },
            { name: "testTicker3", lastTrade: { price: 659.2, time: expectedCheckedAt } }
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

        // lastTickerCheckResult format:
        // lastTickerCheckResult{ CCY:  { currentAugmintRate: {price, lastUpdated},  livePrice, livePriceDifference, [tickersInfo] } };
        // TODO: we should revise when we update this in checkTickerPrice() and then align the test
        //assert.equal(ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.price, expectedPrice);
        // ratesFeeder.lastTickerCheckResult[CCY].currentAugmintRate.lastUpdated
        assert.equal(ratesFeeder.lastTickerCheckResult[CCY].livePrice, expectedPrice);

        assert.isAtLeast(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 0);
        assert.isAtMost(ratesFeeder.lastTickerCheckResult.checkedAt - expectedCheckedAt, 1000);

        assert.equal(newStoredRate.rate, expectedPrice * ratesFeeder.decimalsDiv);

        ratesFeeder.tickers = origtickers;
    });

    it("ratesFeeder should NOT set the price on-chain from tickers when diff < threshold ");

    it("ratesFeeder should NOT set the price on-chain from tickers when all tickers are down");

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
