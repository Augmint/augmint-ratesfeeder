/*
  TODO
* Update every X minutes, or after Y % price movement
* Unit tests
* Multiple sources: GDAX, BitStamp, CEX.io
* Filter out bad prices
* Running on local node, and testnet.
* ...
*/

var fetch = require('fetch')
var AugmintContracts = require('../augmint-contracts/build/contracts/Rates.json')
var contract = require('truffle-contract')

var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

// Truffle abstraction to interact with our deployed contract
var augmintRates = contract(AugmintContracts)
augmintRates.setProvider(web3.currentProvider)


// Dirty hack for web3@1.0.0 support for localhost testrpc
// see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
if (typeof augmintRates.currentProvider.sendAsync !== "function") {
  augmintRates.currentProvider.sendAsync = function() {
    return augmintRates.currentProvider.send.apply(
      augmintRates.currentProvider, arguments
    );
  };
}


// Get accounts from web3
web3.eth.getAccounts((err, accounts) => {
  augmintRates.deployed()
  .then((augmintRatesInstance) => {
      // Fetch data and update it into the contract
      fetch.fetchUrl('https://api.kraken.com/0/public/Ticker?pair=XETHZEUR', (err, m, b) => {
        const krakenJson = JSON.parse(b.toString());
        const price = krakenJson.result.XETHZEUR.c[0];
        console.log("Current ETHEUR price is on the Kraken exchane: " + price);
        // Send data back contract on-chain
        process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... ");
        augmintRatesInstance.setRate("EUR", price*1000, {from: accounts[0]});
        console.log("done.");
      })

  })
  .catch((err) => {
    console.log(err)
  })
})
