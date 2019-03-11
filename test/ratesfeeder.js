/* test of RatesFeeder with mocked ratesProviders
    TODO: mock price info + test edge cases
*/
const assert = require("assert");
const baseHelpers = require("./helpers/base.js");

let ratesFeeder;

describe("RatesFeeder: real exchange rate tests", function() {
    before(async function() {
        ratesFeeder = await baseHelpers.ratesFeeder();
    });

    it("ratesFeeder should set an avarage price of all sources");

    it("set on-chain rate and should be the same", async function() {
        const price = 213.14;
        const CCY = "EUR";
        const bytesCCY = baseHelpers.web3.utils.asciiToHex(CCY);
        await ratesFeeder.updatePrice(CCY, price);
        // TODO: check tx.logs[0].event + args ?

        const storedRate = await ratesFeeder.augmintRatesInstance.methods.rates(bytesCCY).call();

        assert.equal(storedRate.rate, Math.round(price * ratesFeeder.decimalsDiv));
    });
});
