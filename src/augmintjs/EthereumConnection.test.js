const assert = require("chai").assert;
const EthereumConnection = require("./EthereumConnection.js");

const sinon = require("sinon");

describe("EthereumConnection", () => {
    it("should have an initial state", async () => {
        const ethereumConnection = new EthereumConnection();

        assert.isNull(ethereumConnection.web3);
        assert.isNull(ethereumConnection.provider);

        assert(!(await ethereumConnection.isConnected()));
        assert(!ethereumConnection.isStopping);
        assert(!ethereumConnection.isTryingToReconnect);

        assert.isNull(ethereumConnection.networkId);
        assert.isNull(ethereumConnection.blockGasLimit);
        assert.isNull(ethereumConnection.safeBlockGasLimit);
        assert.isNull(ethereumConnection.accounts);
    });

    it("should connect & disconnect (local)", async () => {
        const ethereumConnection = new EthereumConnection();

        const connectedSpy = sinon.spy();
        const disconnectedSpy = sinon.spy();
        const connectionLostSpy = sinon.spy();

        ethereumConnection.on("connected", connectedSpy);
        ethereumConnection.on("disconnected", disconnectedSpy);
        ethereumConnection.on("connectionLost", connectionLostSpy);

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

    it("should return account nonce", async () => {
        const ethereumConnection = new EthereumConnection();
        await ethereumConnection.connect();
        const expectedNonce = await ethereumConnection.web3.eth.getTransactionCount(ethereumConnection.accounts[0]);

        let nonce = await ethereumConnection.getAccountNonce(ethereumConnection.accounts[0]);

        assert.equal(nonce, expectedNonce);

        // with a zero nonce acc, assuming randomAcc has no tx-s from migration subscriptions
        const randomAccount = "0x107af532e6f828da6fe79699123c9a5ea0123d16";
        nonce = await ethereumConnection.getAccountNonce(randomAccount);
        assert.equal(nonce, 0);
    });

    it("should reconnect after connection lost");
});
