/* test of RatesFeeder with mocked ratesProviders
    TODO: mock price info
*/
const assert = require("assert");
const baseHelpers = require("./helpers/base.js");

let ratesFeeder;

describe("RatesFeeder: real exchange rate tests", function() {
    before(async () => {
        ratesFeeder = await baseHelpers.ratesFeeder();
    });

    it("ratesFeeder should return an avarage price of all sources");

    it("ratesFeeder should set an avarage price of all sources when called without price");

    it("set on-chain rate and should be the same", async function() {
        const price = 213.14;
        await ratesFeeder.updatePrice("EUR", price);
        // TODO: check tx.logs[0].event + args ?

        const storedRate = await ratesFeeder.augmintRatesInstance.rates("EUR");
        assert.equal(storedRate[0].c[0], Math.round(price * ratesFeeder.decimalsDiv));
    });
});
