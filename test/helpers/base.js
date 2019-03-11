/* Generic test helper functions */
const RatesFeeder = require("../../src/RatesFeeder.js");
const ratesFeeder = new RatesFeeder([]);

module.exports = {
    get web3() {
        return ratesFeeder.web3;
    },
    ratesFeeder: async function() {
        if (!ratesFeeder.isInitialised) {
            await ratesFeeder.init();
        }
        return ratesFeeder;
    }
};
