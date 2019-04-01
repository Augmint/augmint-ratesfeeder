const expect = require("chai").expect;
const { isOrderBetter } = require("./exchangeTransactions");
const { constants } = require("./constants.js");

describe("fetchOrderBook", () => {
    it("should return empty orderbook when no orders");
    it("shoud return orderbook with orders");
});

describe("isOrderBetter", () => {
    it("o2 should be better (SELL price)", () => {
        const o1 = { direction: constants.TOKEN_SELL, price: 2, id: 1 };
        const o2 = { direction: constants.TOKEN_SELL, price: 1, id: 2 };
        const result = isOrderBetter(o1, o2);
        expect(result).to.be.equal(1);
    });

    it("o1 should be better (BUY price)", () => {
        const o1 = { direction: constants.TOKEN_BUY, price: 2, id: 2 };
        const o2 = { direction: constants.TOKEN_BUY, price: 1, id: 1 };
        const result = isOrderBetter(o1, o2);
        expect(result).to.be.equal(-1);
    });

    it("o2 should be better (SELL id)", () => {
        const o1 = { direction: constants.TOKEN_SELL, price: 1, id: 2 };
        const o2 = { direction: constants.TOKEN_SELL, price: 1, id: 1 };
        const result = isOrderBetter(o1, o2);
        expect(result).to.be.equal(1);
    });

    it("o2 should be better (BUY id)", () => {
        const o1 = { direction: constants.TOKEN_BUY, price: 1, id: 2 };
        const o2 = { direction: constants.TOKEN_BUY, price: 1, id: 1 };
        const result = isOrderBetter(o1, o2);
        expect(result).to.be.equal(1);
    });

    it("o1 should be better when o1 same as o2", () => {
        // same id for two orders, it shouldn't happen
        const o1 = { direction: constants.TOKEN_SELL, price: 1, id: 1 };
        const o2 = { direction: constants.TOKEN_SELL, price: 1, id: 1 };
        const result = isOrderBetter(o1, o2);
        expect(result).to.be.equal(-1);
    });

    it("the direction of the two orders should be same", () => {
        const o1 = { direction: constants.TOKEN_SELL, price: 2, id: 2 };
        const o2 = { direction: constants.TOKEN_BUY, price: 1, id: 1 };
        expect(() => isOrderBetter(o1, o2)).to.throw(/order directions must be the same/);
    });
});
