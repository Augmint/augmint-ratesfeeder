/* Generic test helper functions */
const ratesFeeder = require("../../src/RatesFeeder.js");

module.exports = {
    ratesFeeder: async function() {
        if (!ratesFeeder.isInitialised) {
            await ratesFeeder.init();
        }
        return ratesFeeder;
    }
};
