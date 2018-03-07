/*
  TODO
* Update every X minutes, or after Y % price movement
* Running on private full node, and testnet.
* ...
*/

// config paramaters from .env for exchange data (real exchange rates and simulated rates)
require("./env.js");
const Web3 = require("web3");
const fetch = require("fetch");
const AugmintRates = require("./contractsBuild/Rates.json");
const AugmintToken = require("./contractsBuild/TokenAEur.json");
const contract = require("truffle-contract");

let web3;
let decimalsDiv;
let decimals;
let augmintRatesInstance;
let augmintTokenInstance;
const account = process.env.ETHEREUM_ACCOUNT;

module.exports = {
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
    get augmintTokenInstance() {
        return augmintTokenInstance;
    },
    init,
    getKrakenPrice,
    getBitstampPrice,
    getGdaxPrice,
    getPrice,
    updatePrice
};

async function init() {
    switch (process.env.PROVIDER_TYPE) {
    case "http_local": {
        web3 = new Web3(new Web3.providers.HttpProvider(process.env.HTTP_LOCAL_URL));
        break;
    }
    case "http_infura": {
        if (!process.env.INFURA_API_KEY) {
            throw new Error("PROVIDER_TYPE is " + process.env.PROVIDER_TYPE + " but INFURA_API_KEY is not set");
        }
        web3 = new Web3(new Web3.providers.HttpProvider(process.env.HTTP_INFURA_URL + process.env.INFURA_API_KEY));
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

    decimals = await augmintTokenInstance.decimals();
    decimalsDiv = 10 ** decimals;
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

async function updatePrice(CCY) {
    try {
        const price = await getPrice(CCY);

        // Send data back contract on-chain
        //process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... "); // should be logged into a file
        const tx = await augmintRatesInstance.setRate(CCY, price * decimalsDiv, { from: account });
        // TODO: chain .on callbacks to log submitted but not mined txhash then returned tx on mined event
        // TODO: check tx status and/or RateChanged event + args in args.logs[0]
        console.log(
            `updatePrice():  augmintRatesInstance.setRate(${CCY}, ${price *
                decimalsDiv}, {from: ${account}}) result:\n${JSON.stringify(tx, null, 3)}`
        );

        const storedRates = await augmintRatesInstance.rates(CCY);
        //console.log(storedRates[0].c[0]/100+ " done."); // Should we wait until the price is set as we wanted? // should be logged into a file
    } catch (err) {
        console.log(err);
    }
}
