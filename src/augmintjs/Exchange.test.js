const { expect, assert } = require("chai");
const EthereumConnection = require("./EthereumConnection.js");
const ethereumConnection = new EthereumConnection();
const Exchange = require("./Exchange.js");
const exchange = new Exchange();
const { constants } = require("./constants.js");

describe("connection", () => {
    it("should connect to latest contract", async () => {
        await ethereumConnection.connect();

        assert.isNull(exchange.address);
        await exchange.connect(ethereumConnection);
        assert.equal(exchange.address, "0xFAceA53a04bEfCC6C9246eb3951814cfEE2A1415");
        assert.equal(exchange.ratesInstance._address, "0xb0a2a8e846b66C7384F52635CECEf5280F766C8B");
        // TODO when rates is a class: assert.equal(exchange.rates.address, "0xEE8C7a3e99945A5207Dca026504d67527125Da9C");
    });

    it("should connect to legacy Excahnge contract");
});

describe("fetchOrderBook", () => {
    it("should return empty orderbook when no orders");
    it("shoud return orderbook with orders");
});

describe("isOrderBetter", () => {
    it("o2 should be better (SELL price)", () => {
        const o1 = { direction: constants.TOKEN_SELL, price: 2, id: 1 };
        const o2 = { direction: constants.TOKEN_SELL, price: 1, id: 2 };
        const result = exchange.isOrderBetter(o1, o2);
        expect(result).to.be.equal(1);
    });

    it("o1 should be better (BUY price)", () => {
        const o1 = { direction: constants.TOKEN_BUY, price: 2, id: 2 };
        const o2 = { direction: constants.TOKEN_BUY, price: 1, id: 1 };
        const result = exchange.isOrderBetter(o1, o2);
        expect(result).to.be.equal(-1);
    });

    it("o2 should be better (SELL id)", () => {
        const o1 = { direction: constants.TOKEN_SELL, price: 1, id: 2 };
        const o2 = { direction: constants.TOKEN_SELL, price: 1, id: 1 };
        const result = exchange.isOrderBetter(o1, o2);
        expect(result).to.be.equal(1);
    });

    it("o2 should be better (BUY id)", () => {
        const o1 = { direction: constants.TOKEN_BUY, price: 1, id: 2 };
        const o2 = { direction: constants.TOKEN_BUY, price: 1, id: 1 };
        const result = exchange.isOrderBetter(o1, o2);
        expect(result).to.be.equal(1);
    });

    it("o1 should be better when o1 same as o2", () => {
        // same id for two orders, it shouldn't happen
        const o1 = { direction: constants.TOKEN_SELL, price: 1, id: 1 };
        const o2 = { direction: constants.TOKEN_SELL, price: 1, id: 1 };
        const result = exchange.isOrderBetter(o1, o2);
        expect(result).to.be.equal(-1);
    });

    it("the direction of the two orders should be same", () => {
        const o1 = { direction: constants.TOKEN_SELL, price: 2, id: 2 };
        const o2 = { direction: constants.TOKEN_BUY, price: 1, id: 1 };
        expect(() => exchange.isOrderBetter(o1, o2)).to.throw(/order directions must be the same/);
    });
});
