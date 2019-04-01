const assert = require("chai").assert;
const EthereumConnection = require("./EthereumConnection.js");
const ethereumConnection = new EthereumConnection();
const sinon = require("sinon");

describe("EthereumConnection", () => {
    it("should connect & disconnect (local)", async () => {
        const connectedSpy = sinon.spy();
        const disconnectedSpy = sinon.spy();
        const connectionLostSpy = sinon.spy();

        ethereumConnection.on("connected", connectedSpy);
        ethereumConnection.on("disconnected", disconnectedSpy);
        ethereumConnection.on("connectionLost", connectionLostSpy);

        await ethereumConnection.connect();

        assert(ethereumConnection.isConnected);
        assert(ethereumConnection.blockGasLimit > 0);
        assert(ethereumConnection.safeBlockGasLimit, Math.round(ethereumConnection.blockGasLimit * 0.9));
        assert(!ethereumConnection.isStopping);
        assert(!ethereumConnection.isTryingToReconnect);

        sinon.assert.calledOnce(connectedSpy);
        sinon.assert.notCalled(disconnectedSpy);
        sinon.assert.notCalled(connectionLostSpy);

        await ethereumConnection.stop();

        assert(!ethereumConnection.isConnected);
        assert(ethereumConnection.isStopping);
        assert(!ethereumConnection.isTryingToReconnect);

        sinon.assert.calledOnce(connectedSpy); // 1 event left from initial connect on spy
        sinon.assert.notCalled(connectionLostSpy);
        sinon.assert.calledOnce(disconnectedSpy);
    });

    it("should reconnect after connection lost");
});
