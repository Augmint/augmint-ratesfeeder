/* test of RatesFeeder with mocked ratesProviders
    TODO: mock price info + test edge cases
*/
const assert = require("assert");
const baseHelpers = require("./helpers/base.js");

let ratesFeeder;

describe("RatesFeeder: real exchange rate tests", () => {
    before(async () => {
        ratesFeeder = await baseHelpers.ratesFeeder();
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

    it("ratesFeeder should set the price on-chain from tickers when diff > threshold ");

    it("ratesFeeder should NOT set the price on-chain from tickers when diff < threshold ");

    it("ratesFeeder should NOT set the price on-chain from tickers when all tickers are down");

    it("set on-chain rate and should be the same", async () => {
        const price = 213.14;
        const CCY = "EUR";
        const bytesCCY = baseHelpers.web3.utils.asciiToHex(CCY);
        await ratesFeeder.updatePrice(CCY, price);
        // TODO: check tx.logs[0].event + args ?

        const storedRate = await ratesFeeder.augmintRatesInstance.methods.rates(bytesCCY).call();

        assert.equal(storedRate.rate, Math.round(price * ratesFeeder.decimalsDiv));
    });
});
