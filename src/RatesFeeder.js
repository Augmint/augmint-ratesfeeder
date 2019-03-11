/*
TODO:
- Expose status page
- Logging level for process.env (log only info / errors / warning in prod )
- Use Infura websocket V3 https://infura.io/docs/ethereum/wss/introduction
- Get web3 timeout / confirmatio block params from process.env: https://web3js.readthedocs.io/en/1.0/web3-shh.html#web3-module-transactionblocktimeout
   doesn't work with beta33, might require newer release ?
     SETRATE_TX_TIMEOUT should be set to higher than these:
     const web3Options = {
         transactionBlockTimeout: 50,
         transactionConfirmationBlocks: 24,
         transactionPollingTimeout: 480
     };
        web3.eth.transactionBlockTimeout: ${web3.eth.transactionBlockTimeout}
        web3.eth.transactionConfirmationBlocks: ${web3.eth.transactionConfirmationBlocks}
        web3.eth.transactionPollingTimeout: ${web3.eth.transactionPollingTimeout}
*/

// config paramaters from .env for exchange data (real exchange rates and simulated rates)
require("./env.js");
const ulog = require("ulog");
const log = ulog("ratesFeeder");
const Web3 = require("web3");
const contractsHelper = require("./contractsHelper.js");
const TokenAEur = require("./abiniser/abis/TokenAEur_ABI_2ea91d34a7bfefc8f38ef0e8a5ae24a5.json");
const Rates = require("./abiniser/abis/Rates_ABI_73a17ebb0acc71773371c6a8e1c8e6ce.json");

const CCY = "EUR"; // only EUR is suported by WebsocketTicker providers ATM

let isInitialised = false;
let web3;
let decimalsDiv;
let decimals;
let augmintRatesInstance;
let augmintTokenInstance;
let tickers; // array of WebsocketTicker objects
let checkTickerPriceTimer;
const account = process.env.ETHEREUM_ACCOUNT;
const SET_RATE_GAS_LIMIT = 80000;
const LOG_AS_SUCCESS_AFTER_N_CONFIRMATION = 12;

let currentAugmintRate = {}; // to store the last rate on Augmint format: { EUR: { price, updatetime}}
let livePrice = null; // the price calculated from all the tickers
let livePriceDifference = null; // the

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
    get augmintTokenInstance() {
        return augmintTokenInstance;
    },
    get web3() {
        return web3;
    },
    init,
    updatePrice,
    stop
};

async function init(_tickers) {
    tickers = _tickers;
    const tickerNames = tickers.reduce(
        (accum, ticker, idx) => (idx == 0 ? ticker.name : accum + ", " + ticker.name),
        ""
    );

    log.info(
        // IMPORTANT: NEVER expose keys even not in logs!
        `** RatesFeedeer loaded with settings:
        NODE_ENV: ${process.env.NODE_ENV}
        PROVIDER_TYPE: ${process.env.PROVIDER_TYPE}
        PROVIDER_URL: ${process.env.PROVIDER_URL}
        INFURA_API_KEY: ${process.env.INFURA_API_KEY ? "[secret]" : "not provided"}
        ETHEREUM_ACCOUNT: ${process.env.ETHEREUM_ACCOUNT}
        ETHEREUM_PRIVATE_KEY: ${process.env.ETHEREUM_PRIVATE_KEY ? "[secret]" : "not provided"}
        LIVE_PRICE_THRESHOLD_PT: ${process.env.LIVE_PRICE_THRESHOLD_PT}
        SETRATE_TX_TIMEOUT: ${process.env.SETRATE_TX_TIMEOUT}
        CHECK_TICKER_PRICE_INTERVAL: ${process.env.CHECK_TICKER_PRICE_INTERVAL}
        Ticker providers: ${tickerNames}`
    );

    switch (process.env.PROVIDER_TYPE) {
    case "http": {
        let apiKey = "";

        if (!process.env.INFURA_API_KEY) {
            apiKey = "";
        } else {
            apiKey = process.env.INFURA_API_KEY;
        }

        web3 = await new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL + apiKey));
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

    [augmintRatesInstance, augmintTokenInstance] = await Promise.all([
        contractsHelper.connectLatest(web3, Rates),
        contractsHelper.connectLatest(web3, TokenAEur)
    ]);

    decimals = await augmintTokenInstance.methods.decimals().call();
    decimalsDiv = 10 ** decimals;

    checkTickerPriceTimer = setTimeout(checkTickerPrice, process.env.CHECK_TICKER_PRICE_INTERVAL);

    log.info(`
        AugmintToken contract: ${augmintTokenInstance._address}
        Rates contract: ${augmintRatesInstance._address}`);

    isInitialised = true;
}

// check current price from different exchanges and update Augmint price on chain if difference is beyond threshold
// filters out bad prices, errors, and returns with the avarage
async function checkTickerPrice() {
    log.debug("==> checkTickerPrice() tickers:");
    tickers.forEach(t => {
        log.debug("    ", t.name, t.lastTrade ? t.lastTrade.price : "null", t.lastTrade ? t.lastTrade.time : "null");
    });

    currentAugmintRate[CCY] = await getAugmintRate(CCY);

    updateLivePrice(tickers);
    livePriceDifference =
        Math.round((Math.abs(livePrice - currentAugmintRate[CCY].price) / currentAugmintRate[CCY].price) * 10000) /
        10000;

    log.debug(
        `    checkTickerPrice() currentAugmintRate[${CCY}]: ${
            currentAugmintRate[CCY].price
        } livePrice: ${livePrice} livePriceDifference: ${livePriceDifference * 100} %`
    );

    if (livePriceDifference * 100 > parseFloat(process.env.LIVE_PRICE_THRESHOLD_PT)) {
        await promiseTimeout(process.env.SETRATE_TX_TIMEOUT, updatePrice(CCY, livePrice)).catch(error => {
            // NB: it's not necessarily an error, ethereum network might be just slow.
            // we still schedule our next check which will send an update at next tick of checkTickerPrice()
            log.error("updatePrice failed with Error: ", error);
        });
    }

    // Schedule next check
    checkTickerPriceTimer = setTimeout(checkTickerPrice, process.env.CHECK_TICKER_PRICE_INTERVAL);
}

function promiseTimeout(ms, promise) {
    let id;
    let timeout = new Promise((resolve, reject) => {
        id = setTimeout(() => {
            reject("Timed out in " + ms + "ms.");
        }, ms);
    });

    return Promise.race([promise, timeout]).then(result => {
        clearTimeout(id);
        return result;
    });
}

function updateLivePrice(tickers) {
    const _livePrice = tickers.reduce((accum, ticker) => {
        if (ticker.lastTrade && ticker.lastTrade.price && ticker.lastTrade.price > 0) {
            if (accum > 0) {
                return (accum + ticker.lastTrade.price) / 2;
            } else {
                return ticker.lastTrade.price;
            }
        } else {
            return accum;
        }
    }, 0);
    livePrice = Math.round(_livePrice * decimalsDiv) / decimalsDiv;
}

async function getAugmintRate(currency) {
    const bytesCCY = Web3.utils.asciiToHex(currency);
    const storedRateInfo = await augmintRatesInstance.methods.rates(bytesCCY).call();
    return {
        price: parseInt(storedRateInfo.rate) / decimalsDiv,
        lastUpdated: new Date(parseInt(storedRateInfo.lastUpdated) * 1000)
    };
}

/* Update price on chain.
    price provided rounded to AugmintToken.decimals first */
async function updatePrice(currency, price) {
    try {
        // Send data back contract on-chain
        //process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... "); // should be logged into a file
        const bytes_ccy = web3.utils.asciiToHex(currency);
        const priceToSend = Math.round(price * decimalsDiv);

        const setRateTx = augmintRatesInstance.methods.setRate(bytes_ccy, priceToSend);
        const encodedABI = setRateTx.encodeABI();

        const txToSign = {
            from: account,
            to: augmintRatesInstance._address,
            gas: SET_RATE_GAS_LIMIT,
            data: encodedABI
        };

        const [signedTx, nonce] = await Promise.all([
            web3.eth.accounts.signTransaction(txToSign, process.env.ETHEREUM_PRIVATE_KEY),
            web3.eth.getTransactionCount(account)
        ]);

        log.debug(
            `==> updatePrice() nonce: ${nonce} sending setRate(${currency}, ${priceToSend}). currentAugmintRate[${CCY}]: ${
                currentAugmintRate[CCY].price
            } livePrice: ${livePrice}`
        );

        const tx = web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const receipt = await tx
            .once("transactionHash", hash => {
                log.debug(`    updatePrice() nonce: ${nonce}  txHash: ${hash} hash received`);
            })
            .once("receipt", receipt => {
                log.debug(
                    `    updatePrice() nonce: ${nonce}  txHash: ${
                        receipt.transactionHash
                    } receipt received.  gasUsed: ${receipt.gasUsed}`
                );
            })
            .on("confirmation", (confirmationNumber, receipt) => {
                if (confirmationNumber === LOG_AS_SUCCESS_AFTER_N_CONFIRMATION) {
                    log.log(
                        `    \u2713 updatePrice() nonce: ${nonce}  txHash: ${
                            receipt.transactionHash
                        } mined: setRate(${currency}, ${priceToSend}). Previous Augmint rate: ${
                            currentAugmintRate[CCY].price
                        }`
                    );
                } else {
                    log.debug(
                        `    updatePrice() nonce: ${nonce}  txHash: ${
                            receipt.transactionHash
                        } Confirmation #${confirmationNumber} received.`
                    );
                }
            })
            .on("error", error => {
                log.error(" Error sending tx with nonce: " + nonce + " Error:\n" + error);
            })
            .then(async receipt => {
                log.debug(`    updatePrice() nonce: ${nonce}  txHash: ${receipt.transactionHash} mined.`);
                return receipt;
            });

        if (!receipt.status) {
            log.error(`updatePrice() ERROR. setRate failed, returned status: ${receipt.status}
                   augmintRatesInstance.setRate(${currency}, ${priceToSend}, {nonce: ${nonce}})
                   receipt:
                   ${JSON.stringify(receipt, 3, null)}`);
        }

        // TODO: ganache with websocket hangs forever (b/c no confirmations on ganache)
    } catch (err) {
        log.error(err);
    }
}

function stop() {
    clearTimeout(checkTickerPriceTimer);
    if (web3.currentProvider.connection && typeof web3.currentProvider.connection.close === "function") {
        // connection.close only exists when websocket connection. it is required to close in order node process to stop
        web3.currentProvider.connection.close();
    }
}

function exit(signal) {
    log.info(`\n*** ratesFeeder Received ${signal}. Stopping.`);
    stop();
}
["SIGINT", "SIGHUP", "SIGTERM"].forEach(signal => process.on(signal, signal => exit(signal)));
