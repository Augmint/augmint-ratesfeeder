/* Generic test helper functions */
const ratesFeeder = require("../../src/RatesFeeder.js");

module.exports = {
    get web3() {
        return ratesFeeder.web3;
    },
    ratesFeeder: async function() {
        if (!ratesFeeder.isInitialised) {
            await ratesFeeder.init([]);
        }
        return ratesFeeder;
    }
};
