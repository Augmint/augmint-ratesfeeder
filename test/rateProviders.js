/* TODO: Integration test with real rates provider feeds */
const chai = require("chai");
const assert = chai.assert;
const sinon = require("sinon");

const TickerProvider = require("src/tickerProviders/TickerProvider.js");

const gdaxTickerProvider = require("src/tickerProviders/gdaxTickerProvider.js");
let ticker;

describe("GDAX ticker provider tests", () => {
    before(() => {
        ticker = new TickerProvider(gdaxTickerProvider.definition);
    });

    it("should have correct state before connect", () => {
        const status = ticker.getStatus();
        assert.equal(status.name, "GDAX");

        assert(!status.isConnected);
        assert.isNull(status.connectedAt);
        assert.isNull(status.lastHeartbeat);
        assert.isNull(status.reconnectCount);

        assert.isNull(status.lastTicker);
    });

    it("should connect and have initial ticker", async () => {
        // how to avoid ticker update triggering right after connect when websocket/pusher connected?
        const connectedSpy = sinon.spy();
        ticker.on("connected", connectedSpy);

        const connectionTime = new Date();
        await ticker.connectAndSubscribe();
        assert(connectedSpy.calledOnce);

        let status = ticker.getStatus();

        assert.equal(status.name, "GDAX");
        assert(status.isConnected);
        assert.isAtMost(status.connectedAt - connectionTime, 5000);
        assert.isAtMost(status.lastHeartbeat - connectionTime, 5000);
        assert.equal(status.reconnectCount, 0);

        assert.isNumber(status.lastTicker.price);
        assert.isAtMost(status.connectedAt - status.lastTicker.time, 1000);

        const disconnectedSpy = sinon.spy();
        const disconnectingSpy = sinon.spy();
        ticker.on("disconnecting", disconnectingSpy);
        ticker.on("disconnected", disconnectedSpy);

        await ticker.disconnect();
        assert(disconnectedSpy.calledOnce);
        assert(disconnectingSpy.calledOnce);
        status = ticker.getStatus();
        assert(!status.isConnected);
    });

    it("should terminate for SIGINT");

    it("should return ticker after ticker updated"); // how to mock ticker update?
});
