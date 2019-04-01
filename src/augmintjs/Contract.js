/****************
    Generic Contract super class
    Methods:
        connect(ethereumConnection, abiFile [, address])
            connects to latest deployment or if address provided then  at that address
            NB: connect by address is not implemented tyet
            Input:
                abiFile: abiniser generated JSON file
            Returns: web3 contract instance

    Properties:
        ethereumConnection: where the contract connected to
        web3: === ethereumConnection.web3
        address: conected contract instance address

****/
const contractsHelper = require("src/augmintjs/contractConnection.js");

class Contract {
    constructor() {
        this.ethereumConnection = null;
        this.web3 = null;
        this.instance = null;
    }

    get address() {
        return this.instance ? this.instance._address : null;
    }

    connect(ethereumConnection, abiFile, address) {
        if (address) {
            throw new Error(
                "Connecting to a contract at arbitary address is not supported yet. Pass no address to connect latest contract deployment at network"
            );
        }

        if (!ethereumConnection.isConnected) {
            throw new Error(
                "Contract: not connected to web3 at passed ethereumConnection. call ethereumConnection.connect first"
            );
        }

        this.ethereumConnection = ethereumConnection;
        this.web3 = this.ethereumConnection.web3;

        this.instance = contractsHelper.connectLatest(this.ethereumConnection, abiFile);

        return this.instance;
    }
}

module.exports = Contract;
