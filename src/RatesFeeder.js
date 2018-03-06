/*
  TODO
* Update every X minutes, or after Y % price movement
* Running on private full node, and testnet.
* ...
*/


module.exports = {
    getKrakenPrice,
    getBitstampPrice,
    getPrice,
    updatePrice

};

const fetch = require('fetch')
const AugmintRates = require('../augmint-contracts/build/contracts/Rates.json')
const AugmintToken = require('../augmint-contracts/build/contracts/TokenAEur.json')
const contract = require('truffle-contract')

// config paramaters for exchange data (real exchange rates and simulated rates)
const config = require("config")

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

// Truffle abstraction to interact with our deployed contract
const augmintRates = contract(AugmintRates)
const augmintToken = contract(AugmintToken)
augmintRates.setProvider(web3.currentProvider)
augmintToken.setProvider(web3.currentProvider)


// Dirty hack for web3@1.0.0 support for localhost testrpc
// see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
if (typeof augmintRates.currentProvider.sendAsync !== "function") {
    augmintRates.currentProvider.sendAsync = function() {
        return augmintRates.currentProvider.send.apply(
            augmintRates.currentProvider, arguments
        );
    };
}

// get ETH/CCY price  from Kraken Exchange
function getKrakenPrice(CCY){
    return new Promise(function(resolve, reject) {
        fetch.fetchUrl(config.krakenURL + CCY, (error, m, b) => {
            if (error){
                reject(new Error("Can't get price from Kraken.\n " + error));
            }else{
                const krakenJson = JSON.parse(b.toString());
                const price = krakenJson.result.XETHZEUR.c[0];  // type should be checked
                //console.log("Current ETHEUR price is on the Kraken exchange: " + price); // should be logged into a file
                resolve(parseFloat(price));
            }
        });
    });
}

// get ETH/CCY price  from BitStamp Exchange
function getBitstampPrice(CCY){
    return new Promise(function(resolve, reject) {
        fetch.fetchUrl(config.bitstampURL + CCY, (error, m, b) => {
            if (error){
                reject(new Error("Can't get price from BitStamp.\n " + error));
            }else{
                const bitstampJson = JSON.parse(b.toString());
                const price = bitstampJson.last;  // type should be checked
                //console.log("Current ETHEUR price is on the BitStamp exchange: " + price); // should be logged into a file
                resolve(parseFloat(price));
            }
        });
    });
}

// fetch multiple price from different exchanges
// filters out bad prices, errors, and returns with the avarage
async function getPrice(CCY){
    try{
        // TODO: implement more exchanges. e.g GDAY,  CEX.io
        const [krakenPrice,bitstampPrice]= await Promise.all([getKrakenPrice(CCY), getBitstampPrice(CCY)]);
        // TODO: ignore rates extreme values, or on exception/rejection
        return (krakenPrice+bitstampPrice)/2;
    } catch (e) {
        console.error(e); //
    }
}

// helper function from web/ethHelper.js.
function asyncGetAccounts(web3) {
    return new Promise(function(resolve, reject) {
        web3.eth.getAccounts((error, accounts) => {
            if (error) {
                reject(new Error("Can't get account list from web3 (asyncGetAccounts).\n " + error));
            } else {
                if (!web3.utils.isAddress(accounts[0])) {
                    reject(
                        new Error(
                            "Can't get default account from web3 (asyncGetAccounts)." +
                                "\nIf you are using Metamask make sure it's unlocked with your password."
                        )
                    );
                }
                resolve(accounts);
            }
        });
    });
}


async function updatePrice(CCY){
    try{
        const [accounts,augmintRatesInstance,augmintTokenInstance]= await Promise.all([
            asyncGetAccounts(web3),
            augmintRates.deployed(),
            augmintToken.deployed()
        ]);
        const price = await getPrice(CCY);
        const decimals = await augmintTokenInstance.decimals();
        const decimalsDiv = 10 ** decimals;
        module.exports.decimalsDiv = decimalsDiv;

        // Send data back contract on-chain
        //process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... "); // should be logged into a file
        augmintRatesInstance.setRate(CCY, price*decimalsDiv, {from: accounts[0]});
        const storedRates = await augmintRatesInstance.rates(CCY);
        //console.log(storedRates[0].c[0]/100+ " done."); // Should we wait until the price is set as we wanted? // should be logged into a file

        module.exports.augmintRatesInstance = augmintRatesInstance; // exports for testing

    } catch (err) {
        console.log(err)
    }
}
