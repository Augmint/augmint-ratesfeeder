const assert = require("chai").assert;
const Contract = require("./Contract.js");
const EthereumConnection = require("./EthereumConnection.js");
const ethereumConnection = new EthereumConnection();

describe("constructor", () => {
    it("should be created", () => {
        const contract = new Contract();
        assert.isNull(contract.instance);
        assert.isNull(contract.web3);
        assert.isNull(contract.ethereumConnection);
        assert.isNull(contract.address);
    });

    it("should throw trying to connect without ethereumConnection", () => {
        const contract = new Contract();

        assert.throws(
            () =>
                contract.connect(
                    ethereumConnection,
                    {}
                ),
            Error,
            /not connected to web3/
        );
    });
});
