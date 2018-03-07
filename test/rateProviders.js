/* Integration test with real rates provider feeds */
const assert = require("assert");
const baseHelpers = require("./helpers/base.js");

let ratesFeeder;

describe("rateProviders: real exchange rate tests", function() {
    before(async () => {
        ratesFeeder = await baseHelpers.ratesFeeder();
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
});
