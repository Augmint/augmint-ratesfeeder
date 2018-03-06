const assert = require('assert');
const ratesFeeder = require('../src/RatesFeeder.js');

describe('RatesFeeder: real exchange rate tests', function () {

    it('Kraken interface should return a number', async function () {
        const price = await ratesFeeder.getKrakenPrice("EUR");
        assert.equal('number', typeof price);
    });

    it('BitStamp interface should return a number', async function () {
        const price = await ratesFeeder.getBitstampPrice("EUR");
        assert.equal('number', typeof price);
    });


    it('set on-chain rate and should be the same', async function () {
        const price = await ratesFeeder.getPrice("EUR");
        await ratesFeeder.updatePrice("EUR");
        const storedRate = await ratesFeeder.augmintRatesInstance.rates("EUR");
        assert.equal( parseInt(price *ratesFeeder.decimalsDiv),storedRate[0].c[0]);
    });

});
