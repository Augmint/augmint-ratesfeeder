const ratesFeeder = require("../src/RatesFeeder.js");

ratesFeeder.init().then(async () => {
    await ratesFeeder.updatePrice("EUR");
});
