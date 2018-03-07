/*
  TODO
* Update every X minutes, or after Y % price movement
* Running on private full node, and testnet.
* support ipc for local geth run
* ...
*/

// config paramaters from .env for exchange data (real exchange rates and simulated rates)
require("./env.js");
const Web3 = require("web3");
const fetch = require("fetch");
const AugmintRates = require("./contractsBuild/Rates.json");
const AugmintToken = require("./contractsBuild/TokenAEur.json");
const contract = require("truffle-contract");

let isInitialised = false;
let web3;
let decimalsDiv;
let decimals;
let augmintRatesInstance;
let augmintRatesWeb3Contract; // need to use this instad of truffle-contract for sign txs with privateKey
let augmintTokenInstance;
const account = process.env.ETHEREUM_ACCOUNT;
const SET_RATE_GAS = 60000;
const isInfura = process.env.IS_INFURA === "true" ? true : false;

module.exports = {
    get isInitialised() {
        return isInitialised;
    },
    get decimalsDiv() {
        return decimalsDiv;
    },
    get decimals() {
        return decimals;
    },
    get account() {
        return account;
    },
    get augmintRatesInstance() {
        return augmintRatesInstance;
    },
    get augmintRatesWeb3Contract() {
        return augmintRatesWeb3Contract;
    },
    get augmintTokenInstance() {
        return augmintTokenInstance;
    },
    get web3() {
        return web3;
    },
    init,
    getKrakenPrice,
    getBitstampPrice,
    getGdaxPrice,
    getPrice,
    updatePrice
};

console.log(
    // IMPORTANT: NEVER expose keys even not in logs!
    `** RatesFeedeer loaded with settings:
    NODE_ENV: ${process.env.NODE_ENV}
    PROVIDER_TYPE: ${process.env.PROVIDER_TYPE}
    IS_INFURA: ${process.env.IS_INFURA} (${isInfura ? "true" : false})
    PROVIDER_URL: ${process.env.PROVIDER_URL}
    INFURA_API_KEY: ${process.env.INFURA_API_KEY ? "[secret]" : "not provided"}
    ETHEREUM_ACCOUNT: ${process.env.ETHEREUM_ACCOUNT}
    ETHEREUM_PRIVATE_KEY: ${process.env.ETHEREUM_PRIVATE_KEY ? "[secret]" : "not provided"}`
);

async function init() {
    switch (process.env.PROVIDER_TYPE) {
    case "http": {
        let apiKey = "";
        if (isInfura) {
            if (!process.env.INFURA_API_KEY) {
                throw new Error("PROVIDER_TYPE is http and IS_INFURA == true but INFURA_API_KEY is not set");
            }
            apiKey = process.env.INFURA_API_KEY;
        }

        web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL + apiKey));
        break;
    }
    case "websocket": {
        // NB: infura doesn't require API KEY for WS yet
        web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.PROVIDER_URL));
        break;
    }
    default:
        throw new Error(process.env.PROVIDER_TYPE + " is not supported yet");
    }

    //dirty hack for web3@1.0.0 support for localhost testrpc, see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
    if (typeof web3.currentProvider.sendAsync !== "function") {
        web3.currentProvider.sendAsync = function() {
            return web3.currentProvider.send.apply(web3.currentProvider, arguments);
        };
    }

    if (!web3.utils.isAddress(account)) {
        throw new Error("Invalid ETHEREUM_ACCOUNT: " + account);
    }
    web3.eth.defaultAccount = account;

    // Truffle abstraction to interact with our deployed contract
    const augmintRates = contract(AugmintRates);
    const augmintToken = contract(AugmintToken);

    // TODO: move all connection logic to a separate component: connection.js or ethereumConnection.js?
    const networkId = await web3.eth.net.getId();

    augmintRates.setProvider(web3.currentProvider);
    augmintToken.setProvider(web3.currentProvider);
    augmintRates.setNetwork(networkId);
    augmintToken.setNetwork(networkId);
    augmintRatesInstance = augmintRates.at(augmintRates.address);
    augmintTokenInstance = augmintToken.at(augmintToken.address);
    augmintRatesWeb3Contract = new web3.eth.Contract(augmintRates.abi, augmintRates.address);

    decimals = await augmintTokenInstance.decimals();
    decimalsDiv = 10 ** decimals;
    isInitialised = true;
}

// get ETH/CCY price  from Kraken Exchange
function getKrakenPrice(CCY) {
    return new Promise(function(resolve, reject) {
        fetch.fetchUrl(process.env.KRAKEN_URL + CCY, (error, m, b) => {
            if (error) {
                reject(new Error("Can't get price from Kraken.\n " + error));
            } else {
                const krakenJson = JSON.parse(b.toString());
                const price = krakenJson.result.XETHZEUR.c[0]; // type should be checked
                //console.log("Current ETHEUR price is on the Kraken exchange: " + price); // should be logged into a file
                resolve(parseFloat(price));
            }
        });
    });
}

// get ETH/CCY price  from BitStamp Exchange
function getBitstampPrice(CCY) {
    return new Promise(function(resolve, reject) {
        fetch.fetchUrl(process.env.BITSTAMP_URL + CCY, (error, m, b) => {
            if (error) {
                reject(new Error("Can't get price from BitStamp.\n " + error));
            } else {
                const bitstampJson = JSON.parse(b.toString());
                const price = bitstampJson.last; // type should be checked
                //console.log("Current ETHEUR price is on the BitStamp exchange: " + price); // should be logged into a file
                resolve(parseFloat(price));
            }
        });
    });
}

// get ETH/CCY price  from BitStamp Exchange
function getGdaxPrice(CCY) {
    return new Promise(function(resolve, reject) {
        fetch.fetchUrl(process.env.GDAX_URL + CCY + "/ticker", (error, m, b) => {
            if (error) {
                reject(new Error("Can't get price from BitStamp.\n " + error));
            } else {
                const bitstampJson = JSON.parse(b.toString());
                const price = bitstampJson.price; // type should be checked
                //console.log("Current ETHEUR price is on the BitStamp exchange: " + price); // should be logged into a file
                resolve(parseFloat(price));
            }
        });
    });
}

// fetch multiple price from different exchanges
// filters out bad prices, errors, and returns with the avarage
async function getPrice(CCY) {
    try {
        // TODO: implement more exchanges. e.g GDAY,  CEX.io
        const [krakenPrice, gdaxPrice] = await Promise.all([getKrakenPrice(CCY), getGdaxPrice(CCY)]);
        // TODO: ignore rates extreme values, or on exception/rejection
        return (krakenPrice + gdaxPrice) / 2;
    } catch (e) {
        console.error(e); //
    }
}

function onConfirmation(confirmationNumber, receipt) {
    console.log(`  Confirmation #${confirmationNumber} received. txhash: ${receipt.transactionHash}`);
}

async function updatePrice(CCY, price) {
    try {
        if (typeof price === "undefined") {
            price = await getPrice(CCY);
        }

        // Send data back contract on-chain
        //process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... "); // should be logged into a file
        const bytes_ccy = web3.utils.asciiToHex(CCY);
        const priceToSend = Math.round(price * decimalsDiv);
        const setRateTx = augmintRatesWeb3Contract.methods.setRate(bytes_ccy, priceToSend);
        const encodedABI = setRateTx.encodeABI();

        const txToSign = {
            from: account,
            to: augmintRatesInstance.address,
            gas: SET_RATE_GAS,
            data: encodedABI
        };

        const signedTx = await web3.eth.accounts.signTransaction(txToSign, process.env.ETHEREUM_PRIVATE_KEY);

        console.log(
            `==> updatePrice() sending setRate(${CCY}, ${priceToSend}) from ${account} to ${
                augmintRatesInstance.address
            } at ${process.env.PROVIDER_URL}`
        );
        let tx;
        if (isInfura) {
            // we receive Invalid JSON RPC response: "" from infura with sendTransaction
            tx = web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        } else {
            // we receive sender "sender doesn't have enough funds to send tx." on ganache with sendSignedTransaction
            // TODO: test which call work on other networks than infura/local (eg. local geth?) + how to use same call
            tx = web3.eth.sendTransaction(signedTx);
        }

        tx.on("error", error => {
            throw new Error(error);
        });

        tx.on("transactionHash", hash => {
            console.log("  tx hash received: " + hash);
        });

        tx.on("confirmation", onConfirmation);

        const receipt = await tx.on("receipt");

        if (web3.utils.hexToNumber(receipt.status) !== 1) {
            throw new Error(`updatePrice() setRate failed, returned status: ${receipt.status}
               augmintRatesInstance.setRate(${CCY}, ${priceToSend}, {from: ${account}})
               receipt:
               ${JSON.stringify(receipt, 3, null)}`);
        }
        console.log(`  receipt received.  gasUsed: ${receipt.gasUsed} txhash: ${receipt.transactionHash}`);

        // TODO: return after a few confirmations (web3's .on('confirmation') waits for 24...).
        // TODO: ganache with websocket hangs forever (b/c no confirmations on ganache)

        //const storedRates = await augmintRatesInstance.rates(CCY);
        //console.log(storedRates[0].c[0]/100+ " done."); // Should we wait until the price is set as we wanted? // should be logged into a file
    } catch (err) {
        console.error(err);
    }
}
