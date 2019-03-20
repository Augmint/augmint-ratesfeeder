/* TODO: Integration test with real rates provider feeds */
const chai = require("chai");
const assert = chai.assert;
const sinon = require("sinon");

const TickerProvider = require("src/tickerProviders/TickerProvider.js");

const gdaxTickerProviderDef = require("src/tickerProviders/gdaxTickerProvider.js");
const krakenTickerProviderDef = require("src/tickerProviders/krakenTickerProvider.js");
const bitstampTickerProviderDef = require("src/tickerProviders/bitstampTickerProvider.js");

const tickerDefs = [gdaxTickerProviderDef, krakenTickerProviderDef, bitstampTickerProviderDef];

tickerDefs.forEach(tickerDef => {
    const tickerName = tickerDef.definition.NAME;
    describe(tickerName + " ticker provider tests", () => {
        it("should have correct state before connect", () => {
            const ticker = new TickerProvider(tickerDef.definition);
            const status = ticker.getStatus();
            assert.isString(status.name);
            assert.isNotEmpty(status.name);

            assert(!status.isConnected);
            assert.isNull(status.connectedAt);
            assert.isNull(status.lastHeartbeat);
            assert.isNull(status.reconnectCount);

            assert.isNull(status.lastTicker);
        });

        it("should connect and have initial ticker then disconnect", async () => {
            // how to avoid ticker update triggering right after connect when websocket/pusher connected?
            const ticker = new TickerProvider(tickerDef.definition);
            const connectedSpy = sinon.spy();
            const initTickerSpy = sinon.spy();
            ticker.on("connected", connectedSpy);
            ticker.on("initialtickerinforeceived", initTickerSpy);

            const connectionTime = new Date();
            await ticker.connectAndSubscribe();

            let status = ticker.getStatus();
            assert(connectedSpy.calledOnce);
            assert(initTickerSpy.calledOnce);

            assert.equal(status.name, tickerName);
            assert(status.isConnected);
            assert.isAtMost(status.connectedAt - connectionTime, 5000);
            assert.isAtMost(status.lastHeartbeat - connectionTime, 5000);
            assert.equal(status.reconnectCount, 0);

            assert.isNumber(status.lastTicker.price);
            assert.isAtMost(status.connectedAt - status.lastTicker.time, 10000);

            const disconnectedSpy = sinon.spy();
            const disconnectingSpy = sinon.spy();
            ticker.on("disconnecting", disconnectingSpy);
            ticker.on("disconnected", disconnectedSpy);

            await ticker.disconnect();

            assert(disconnectedSpy.calledOnce);
            assert(disconnectingSpy.calledOnce);
            status = ticker.getStatus();
            assert.equal(status.reconnectCount, 0);
            assert(!status.isConnected);
        });

        it("should terminate for SIGINT");

        it("should return ticker after ticker updated"); // how to mock ticker update?
    });
});
