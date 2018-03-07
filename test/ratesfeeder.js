const assert = require("assert");
const ratesFeeder = require("../src/RatesFeeder.js");

describe("RatesFeeder: real exchange rate tests", function() {
    before(async () => {
        await ratesFeeder.init();
    });

    it("Kraken interface should return a number", async function() {
        const price = await ratesFeeder.getKrakenPrice("EUR");
        assert.equal(typeof price, "number");
    });

    it.skip("BitStamp interface should return a number", async function() {
        const price = await ratesFeeder.getBitstampPrice("EUR");
        assert.equal(typeof price, "number");
    });

    it("Gdax interface should return a number", async function() {
        const price = await ratesFeeder.getGdaxPrice("EUR");
        assert.equal(typeof price, "number");
    });

    it("set on-chain rate and should be the same", async function() {
        const price = await ratesFeeder.getPrice("EUR");
        await ratesFeeder.updatePrice("EUR");
        // TODO: check tx.logs[0].event + args ?
        const storedRate = await ratesFeeder.augmintRatesInstance.rates("EUR");
        assert.equal(storedRate[0].c[0], parseInt(price * ratesFeeder.decimalsDiv));
    });
});
