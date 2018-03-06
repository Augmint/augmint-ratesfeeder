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
const AugmintRates = require("../augmint-contracts/build/contracts/Rates.json");
const AugmintToken = require("../augmint-contracts/build/contracts/TokenAEur.json");
const contract = require("truffle-contract");

let decimalsDiv;
let augmintRatesInstance;
let augmintTokenInstance;
const account = process.env.ETHEREUM_ACCOUNT;

module.exports = {
    get decimalsDiv() {
        return decimalsDiv;
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
    getKrakenPrice,
    getBitstampPrice,
    getGdaxPrice,
    getPrice,
    updatePrice
};

const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.HTTP_PROVIDER_URL));

if (!web3.utils.isAddress(account)) {
    throw new Error("Invalid ETHEREUM_ACCOUNT: " + account);
}

// Truffle abstraction to interact with our deployed contract
const augmintRates = contract(AugmintRates);
const augmintToken = contract(AugmintToken);
augmintRates.setProvider(web3.currentProvider);
augmintToken.setProvider(web3.currentProvider);

// Dirty hack for web3@1.0.0 support for localhost testrpc
// see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
if (typeof augmintRates.currentProvider.sendAsync !== "function") {
    augmintRates.currentProvider.sendAsync = function() {
        return augmintRates.currentProvider.send.apply(augmintRates.currentProvider, arguments);
    };
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
        [augmintRatesInstance, augmintTokenInstance] = await Promise.all([
            augmintRates.deployed(),
            augmintToken.deployed()
        ]);
        const price = await getPrice(CCY);
        const decimals = await augmintTokenInstance.decimals();
        decimalsDiv = 10 ** decimals;

        // Send data back contract on-chain
        //process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... "); // should be logged into a file
        augmintRatesInstance.setRate(CCY, price * decimalsDiv, { from: account });
        const storedRates = await augmintRatesInstance.rates(CCY);
        //console.log(storedRates[0].c[0]/100+ " done."); // Should we wait until the price is set as we wanted? // should be logged into a file
    } catch (err) {
        console.log(err);
    }
}
