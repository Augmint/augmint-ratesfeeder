/* Integration test with mocked ticker provider data

*/
const chai = require("chai");
const assert = chai.assert;
const sinon = require("sinon");
const nock = require("nock");

const CoinbaseTickerProvider = require("src/tickerProviders/CoinbaseHttpTicker.js");
const KrakenTickerProvider = require("src/tickerProviders/KrakenHttpTicker.js");
const BitstampTickerProvider = require("src/tickerProviders/BitStampHttpTicker.js");

const tickerProviders = [CoinbaseTickerProvider, KrakenTickerProvider, BitstampTickerProvider];
const MOCKS = {
    CoinbaseHttpTicker: {
        host: "https://api.pro.coinbase.com",
        path: "/products/eth-eur/ticker",
        okResponse1: {
            trade_id: 6154326,
            price: "121.68000000",
            size: "0.39256426",
            time: "2019-03-21T08:42:26.745Z",
            bid: "121.68",
            ask: "121.69",
            volume: "9461.04152552"
        },
        okResponse2: {
            price: "122.56000000",
            time: "2019-03-21T08:42:26.745Z"
        }
    },
    KrakenHttpTicker: {
        host: "https://api.kraken.com",
        path: "/0/public/Ticker?pair=etheur",
        okResponse1: {
            error: [],
            result: {
                XETHZEUR: {
                    a: ["121.74000", "16", "16.000"],
                    b: ["121.62000", "8", "8.000"],
                    c: ["121.61000", "25.91340111"],
                    v: ["4520.33969535", "32503.89674747"],
                    p: ["121.35802", "121.06636"],
                    t: [1038, 8081],
                    l: ["120.32000", "119.51000"],
                    h: ["121.94000", "122.39000"],
                    o: "121.53000"
                }
            }
        },
        okResponse2: {
            error: [],
            result: {
                XETHZEUR: {
                    c: ["123.72000", "26.81340111"],
                    p: ["122.48602", "122.45195"]
                }
            }
        }
    },
    BitstampHttpTicker: {
        host: "https://www.bitstamp.net",
        path: "/api/v2/ticker/etheur",
        okResponse1: {
            high: "122.25",
            last: "121.75",
            timestamp: "1553156927",
            bid: "121.52",
            vwap: "121.04",
            volume: "9095.79284538",
            low: "119.55",
            ask: "121.77",
            open: "121.33"
        },
        okResponse2: {
            last: "123.75",
            timestamp: "1553157131",
            vwap: "122.04"
        }
    }
};

tickerProviders.forEach(Provider => {
    const tickerClassName = Provider.name;
    describe(tickerClassName + " tests", () => {
        it("should have correct state before connect", () => {
            const startedAt = new Date();
            const ticker = new Provider();

            const status = ticker.getStatus();

            assert.isString(status.name);
            assert.isNotEmpty(status.name);
            assert(!status.isConnected);
            assert(!status.isDisconnecting);
            assert.isAtMost(status.startedAt - startedAt, 2000);
            assert.isNull(status.error);
            assert.isNull(status.lastPollAttemptAt);
            assert.equal(status.pollErrorCount, 0);

            assert.isNull(status.lastTicker.price);
            assert.isNull(status.lastTicker.receivedAt);
        });

        it("should connect and have initial ticker then disconnect", async () => {
            const scope = nock(MOCKS[tickerClassName].host)
                .get(MOCKS[tickerClassName].path)
                .reply(200, MOCKS[tickerClassName].okResponse1);

            const startedAt = new Date();
            const ticker = new Provider();
            const connectingSpy = sinon.spy();
            const connectedSpy = sinon.spy();
            const tickerReceivedSpy = sinon.spy();
            const tickerUpdatedSpy = sinon.spy();
            const tickerPriceChangedSpy = sinon.spy();
            ticker.on("connecting", connectingSpy);
            ticker.on("connected", connectedSpy);
            ticker.on("tickerreceived", tickerReceivedSpy);
            ticker.on("tickerupdated", tickerUpdatedSpy);
            ticker.on("tickerpricechanged", tickerPriceChangedSpy);

            await ticker.connect();

            let status = ticker.getStatus();
            assert(connectingSpy.calledOnce);
            assert(connectedSpy.calledOnce);
            assert(tickerReceivedSpy.calledOnce);
            assert(tickerUpdatedSpy.calledOnce);
            assert(tickerPriceChangedSpy.calledOnce);

            assert.isString(status.name);
            assert.isNotEmpty(status.name);
            assert(status.isConnected);
            assert(!status.isDisconnecting);
            assert.isAtMost(status.startedAt - startedAt, 2000);
            assert.isAtMost(status.lastPollAttemptAt - startedAt, 2000);
            assert.isAtMost(status.lastTicker.receivedAt - status.lastPollAttemptAt, 10000);

            assert.isNumber(status.lastTicker.price);

            assert.isNull(status.error);
            assert.equal(status.pollErrorCount, 0);

            const disconnectedSpy = sinon.spy();
            const disconnectingSpy = sinon.spy();
            ticker.on("disconnecting", disconnectingSpy);
            ticker.on("disconnected", disconnectedSpy);

            /**** DISCONNECT ***/
            await ticker.disconnect();

            assert(disconnectedSpy.calledOnce);
            assert(disconnectingSpy.calledOnce);
            status = ticker.getStatus();

            assert.isNull(status.error);
            assert.equal(status.pollErrorCount, 0);

            assert(!status.isConnected);
            assert(!status.isDisconnecting);
        });

        it("should abort if first poll fails", async () => {
            const scope = nock(MOCKS[tickerClassName].host)
                .get(MOCKS[tickerClassName].path)
                .reply(404);

            const ticker = new Provider();

            const providerErrorSpy = sinon.spy();
            ticker.on("providerError", providerErrorSpy);

            await ticker.connect().catch(() => true /* this is what we expect */);

            let status = ticker.getStatus();
            assert(!status.isConnected, "Shouldn't be connected when fetch fails (mock connect succeeded?)");
            assert.isNotEmpty(status.error);
            assert.equal(status.pollErrorCount, 1);
            assert.isAtMost(status.lastPollAttemptAt - status.startedAt, 1000);
            assert(providerErrorSpy.calledOnce, "should have an error or 2nd try");
        });

        it("should not abort if a poll fails after initial suceeded", async () => {
            const scope = nock(MOCKS[tickerClassName].host)
                .get(MOCKS[tickerClassName].path)
                .reply(200, MOCKS[tickerClassName].okResponse1)
                .get(MOCKS[tickerClassName].path)
                .reply(404)
                .get(MOCKS[tickerClassName].path)
                .reply(200, MOCKS[tickerClassName].okResponse2);

            const ticker = new Provider();

            /************************
             * 1st: initial okResponse1 after connect
             ************************/
            await ticker.connect();

            let status = ticker.getStatus();
            assert(status.isConnected);
            assert.isNull(status.error);
            assert.equal(status.pollErrorCount, 0);

            /************************
             * 2nd: 404 failed
             ************************/
            const providerErrorSpy = sinon.spy();
            ticker.on("providerError", providerErrorSpy);
            await ticker.poll();

            status = ticker.getStatus();
            assert(!status.isConnected, "Shouldn't be connected when fetch fails (mock connect succeeded?)");
            assert.isNotEmpty(status.error);
            assert.equal(status.pollErrorCount, 1);
            assert.isAtMost(status.lastPollAttemptAt - status.startedAt, 1000);
            assert(providerErrorSpy.calledOnce);

            /************************
             * 3rd: okResponse2
             ************************/
            const tickerReceivedSpy = sinon.spy();
            const tickerUpdatedSpy = sinon.spy();
            const tickerPriceChangedSpy = sinon.spy();
            ticker.on("tickerreceived", tickerReceivedSpy);
            ticker.on("tickerupdated", tickerUpdatedSpy);
            ticker.on("tickerpricechanged", tickerPriceChangedSpy);

            await ticker.poll();
            status = ticker.getStatus();
            assert(status.isConnected);
            assert.isNull(status.error);
            assert.equal(status.pollErrorCount, 1);
            assert(tickerReceivedSpy.calledOnce);
            assert(tickerUpdatedSpy.calledOnce);
            assert(tickerPriceChangedSpy.calledOnce);
        });
    });
});
