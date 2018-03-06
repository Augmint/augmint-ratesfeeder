const ratesFeeder = require("../src/RatesFeeder.js");

ratesFeeder.init().then(() => {
    ratesFeeder.updatePrice("EUR");
});
