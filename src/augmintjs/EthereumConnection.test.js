const assert = require("chai").assert;
const EthereumConnection = require("./EthereumConnection.js");
const sinon = require("sinon");

let ethereumConnection;

describe("EthereumConnection", () => {
    it("should connect & disconnect (local)", async () => {
        ethereumConnection = new EthereumConnection();
        const connectedSpy = sinon.spy();
        const disconnectedSpy = sinon.spy();
        const connectionLostSpy = sinon.spy();

        ethereumConnection.on("connected", connectedSpy);
        ethereumConnection.on("disconnected", disconnectedSpy);
        ethereumConnection.on("connectionLost", connectionLostSpy);

        assert(!(await ethereumConnection.isConnected()));

        await ethereumConnection.connect();

        const expNetworkId = parseInt(await ethereumConnection.web3.eth.net.getId(), 10);

        assert(await ethereumConnection.isConnected());
        assert.equal(ethereumConnection.networkId, expNetworkId);
        assert(ethereumConnection.blockGasLimit > 0);
        assert(ethereumConnection.safeBlockGasLimit, Math.round(ethereumConnection.blockGasLimit * 0.9));

        assert.isArray(ethereumConnection.accounts);
        ethereumConnection.accounts.forEach(acc => assert(ethereumConnection.web3.utils.isAddress(acc)));

        assert(!ethereumConnection.isStopping);
        assert(!ethereumConnection.isTryingToReconnect);

        sinon.assert.calledOnce(connectedSpy);
        sinon.assert.notCalled(disconnectedSpy);
        sinon.assert.notCalled(connectionLostSpy);

        await ethereumConnection.stop();

        assert(!(await ethereumConnection.isConnected()));
        assert(ethereumConnection.isStopping);
        assert(!ethereumConnection.isTryingToReconnect);

        sinon.assert.calledOnce(connectedSpy); // 1 event left from initial connect on spy
        sinon.assert.notCalled(connectionLostSpy);
        sinon.assert.calledOnce(disconnectedSpy);
    });

    it("should get options as constructor parameters too", async () => {
        const options = {
            ETHEREUM_CONNECTION_CHECK_INTERVAL: 100,
                ETHEREUM_CONNECTION_TIMEOUT: 1000,
            PROVIDER_TYPE: "test",
            PROVIDER_URL: "hoops",
            INFURA_PROJECT_ID: "bingo"
        };

        ethereumConnection = new EthereumConnection(options);

        assert(ethereumConnection.ETHEREUM_CONNECTION_CHECK_INTERVAL, options.ETHEREUM_CONNECTION_CHECK_INTERVAL);
        assert.equal(ethereumConnection.PROVIDER_TYPE, options.PROVIDER_TYPE);
        assert.equal(ethereumConnection.PROVIDER_URL, options.PROVIDER_URL);
        assert.equal(ethereumConnection.INFURA_PROJECT_ID, options.INFURA_PROJECT_ID);
            assert.equal(ethereumConnection.ETHEREUM_CONNECTION_TIMEOUT, options.ETHEREUM_CONNECTION_TIMEOUT);
    });

    it("should reconnect after connection lost", done => {
        const connectionLostSpy = sinon.spy();
        const disconnectedSpy = sinon.spy();
        const checkInterval = 100;

        ethereumConnection = new EthereumConnection({ ETHEREUM_CONNECTION_CHECK_INTERVAL: checkInterval });

        const onConnectionLoss = async (event, eConnObj) => {
            connectionLostSpy(event, eConnObj);
                assert.equal(event.reason, "checkConnection detected connectionloss");
        };

        const onConnected = async () => {
            // this is only set up for the reconnection we expect
            assert(await ethereumConnection.isConnected());
            assert(connectionLostSpy.calledOnce);
            assert(disconnectedSpy.calledOnce);
            done();
        };

        ethereumConnection.on("disconnected", disconnectedSpy);
        ethereumConnection.on("connectionLost", onConnectionLoss);

        ethereumConnection.connect().then(async () => {
            assert(await ethereumConnection.isConnected());

            ethereumConnection.on("connected", onConnected); // we only setup connected here

            ethereumConnection.web3.currentProvider.connection.close(); // simulate connection drop
            assert(!(await ethereumConnection.isConnected()));
        });
    });
});
