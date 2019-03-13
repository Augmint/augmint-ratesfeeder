/*
TODO:
- Expose status page
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

require("./env.js");
const ulog = require("ulog");
const log = ulog("ratesFeeder");
const Web3 = require("web3");
const contractsHelper = require("./contractsHelper.js");
const TokenAEur = require("./abiniser/abis/TokenAEur_ABI_2ea91d34a7bfefc8f38ef0e8a5ae24a5.json");
const Rates = require("./abiniser/abis/Rates_ABI_73a17ebb0acc71773371c6a8e1c8e6ce.json");

const CCY = "EUR"; // only EUR is suported by WebsocketTicker providers ATM
const SET_RATE_GAS_LIMIT = 80000;

const median = values => {
    values.sort((a, b) => a - b);

    if (values.length === 0) return 0;

    const half = Math.floor(values.length / 2);

    if (values.length % 2) {
        return values[half];
    } else {
        return (values[half - 1] + values[half]) / 2.0;
    }
};

class RatesFeeder {
    constructor(tickers) {
        this.tickers = tickers; // array of WebsocketTicker objects
        // list of tickernames:
        this.tickerNames = this.tickers.reduce(
            (accum, ticker, idx) => (idx == 0 ? ticker.name : accum + ", " + ticker.name),
            ""
        );
        this.web3 = null;
        this.isInitialised = false;
        this.decimalsDiv = null;
        this.decimals = null;
        this.augmintRatesInstance = null;
        this.augmintTokenInstance = null;
        this.checkTickerPriceTimer = null;
        this.account = null;
        this.lastTickerCheckResult = {};
    }

    async init() {
        ["SIGINT", "SIGHUP", "SIGTERM"].forEach(signal => process.on(signal, signal => this.exit(signal)));

        this.account = process.env.ETHEREUM_ACCOUNT;

        log.info(
            // IMPORTANT: NEVER expose keys even not in logs!
            `** RatesFeedeer starting with settings:
            NODE_ENV: ${process.env.NODE_ENV}
            PROVIDER_TYPE: ${process.env.PROVIDER_TYPE}
            PROVIDER_URL: ${process.env.PROVIDER_URL}
            INFURA_API_KEY: ${process.env.INFURA_API_KEY ? "[secret]" : "not provided"}
            ETHEREUM_ACCOUNT: ${process.env.ETHEREUM_ACCOUNT}
            ETHEREUM_PRIVATE_KEY: ${process.env.ETHEREUM_PRIVATE_KEY ? "[secret]" : "not provided"}
            LIVE_PRICE_THRESHOLD_PT: ${process.env.LIVE_PRICE_THRESHOLD_PT}
            SETRATE_TX_TIMEOUT: ${process.env.SETRATE_TX_TIMEOUT}
            CHECK_TICKER_PRICE_INTERVAL: ${process.env.CHECK_TICKER_PRICE_INTERVAL}
            LOG: ${process.env.LOG} (log.level: ${log.level})
            LOG_AS_SUCCESS_AFTER_N_CONFIRMATION: ${process.env.LOG_AS_SUCCESS_AFTER_N_CONFIRMATION}
            Ticker providers: ${this.tickerNames}`
        );

        switch (process.env.PROVIDER_TYPE) {
        case "http": {
            let apiKey = "";

            if (!process.env.INFURA_API_KEY) {
                apiKey = "";
            } else {
                apiKey = process.env.INFURA_API_KEY;
            }

            this.web3 = await new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL + apiKey));
            break;
        }
        case "websocket": {
            // NB: infura doesn't require API KEY for WS yet
            this.web3 = await new Web3(new Web3.providers.WebsocketProvider(process.env.PROVIDER_URL));
            break;
        }
        default:
            throw new Error(process.env.PROVIDER_TYPE + " is not supported yet");
        }

        //dirty hack for web3@1.0.0 support for localhost testrpc, see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
        if (typeof this.web3.currentProvider.sendAsync !== "function") {
            this.web3.currentProvider.sendAsync = function() {
                return this.web3.currentProvider.send.apply(this.web3.currentProvider, arguments);
            }.bind(this);
        }

        if (!Web3.utils.isAddress(this.account)) {
            throw new Error("Invalid ETHEREUM_ACCOUNT: " + this.account);
        }
        this.web3.eth.defaultAccount = this.account;

        [this.augmintRatesInstance, this.augmintTokenInstance] = await Promise.all([
            contractsHelper.connectLatest(this.web3, Rates),
            contractsHelper.connectLatest(this.web3, TokenAEur)
        ]);

        this.decimals = await this.augmintTokenInstance.methods.decimals().call();
        this.decimalsDiv = 10 ** this.decimals;

        // Schedule first check
        this.checkTickerPriceTimer =
            process.env.CHECK_TICKER_PRICE_INTERVAL > 0
                ? setTimeout(this.checkTickerPrice.bind(this), process.env.CHECK_TICKER_PRICE_INTERVAL)
                : null;

        log.info(`
            AugmintToken contract: ${this.augmintTokenInstance._address}
            Rates contract: ${this.augmintRatesInstance._address}`);

        this.isInitialised = true;
    }

    // check current price from different exchanges and update Augmint price on chain if difference is beyond threshold
    // filters out bad prices, errors, and returns with the avarage
    async checkTickerPrice() {
        log.debug("==> checkTickerPrice() tickers:");
        this.tickers.forEach(t => {
            log.debug(
                "    ",
                t.name,
                t.lastTrade ? t.lastTrade.price : "null",
                t.lastTrade ? t.lastTrade.time : "null"
            );
        });

        const currentAugmintRate = await this.getAugmintRate(CCY);

        const livePrice = this.calculateAugmintPrice(this.tickers);
        const livePriceDifference =
            Math.round((Math.abs(livePrice - currentAugmintRate.price) / currentAugmintRate.price) * 10000) / 10000;

        log.debug(
            `    checkTickerPrice() currentAugmintRate[${CCY}]: ${
                currentAugmintRate.price
            } livePrice: ${livePrice} livePriceDifference: ${(livePriceDifference * 100).toFixed(2)} %`
        );

        const tickersInfo = this.tickers.map(t => ({ name: t.name, lastTrade: t.lastTrade }));
        this.lastTickerCheckResult.checkedAt = new Date();
        this.lastTickerCheckResult[CCY] = {
            currentAugmintRate,
            livePrice,
            livePriceDifference,
            tickersInfo
        };

        if (livePriceDifference * 100 > parseFloat(process.env.LIVE_PRICE_THRESHOLD_PT)) {
            await this.promiseTimeout(process.env.SETRATE_TX_TIMEOUT, this.updatePrice(CCY, livePrice)).catch(error => {
                // NB: it's not necessarily an error, ethereum network might be just slow.
                // we still schedule our next check which will send an update at next tick of checkTickerPrice()
                log.error("updatePrice failed with Error: ", error);
            });
        }

        // Schedule next check
        this.checkTickerPriceTimer =
            process.env.CHECK_TICKER_PRICE_INTERVAL > 0
                ? setTimeout(this.checkTickerPrice.bind(this), process.env.CHECK_TICKER_PRICE_INTERVAL)
                : null;
    }

    promiseTimeout(ms, promise) {
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

    calculateAugmintPrice(tickers) {
        // ignore 0 or null prices (exchange down or no price info yet)
        const prices = tickers
            .filter(ticker => ticker.lastTrade && ticker.lastTrade.price > 0)
            .map(t => t.lastTrade.price);
        const augmintPrice = median(prices);

        return Math.round(augmintPrice * this.decimalsDiv) / this.decimalsDiv;
    }

    async getAugmintRate(currency) {
        const bytesCCY = Web3.utils.asciiToHex(currency);
        const storedRateInfo = await this.augmintRatesInstance.methods.rates(bytesCCY).call();
        return {
            price: parseInt(storedRateInfo.rate) / this.decimalsDiv,
            lastUpdated: new Date(parseInt(storedRateInfo.lastUpdated) * 1000)
        };
    }

    /* Update price on chain.
        price provided rounded to AugmintToken.decimals first */
    async updatePrice(currency, price) {
        try {
            // Send data back contract on-chain
            //process.stdout.write("Sending to the Augmint Contracts using Rates.setRate() ... "); // should be logged into a file
            const bytes_ccy = Web3.utils.asciiToHex(currency);
            const priceToSend = Math.round(price * this.decimalsDiv);

            const setRateTx = this.augmintRatesInstance.methods.setRate(bytes_ccy, priceToSend);
            const encodedABI = setRateTx.encodeABI();

            const txToSign = {
                from: this.account,
                to: this.augmintRatesInstance._address,
                gas: SET_RATE_GAS_LIMIT,
                data: encodedABI
            };

            const [signedTx, nonce] = await Promise.all([
                this.web3.eth.accounts.signTransaction(txToSign, process.env.ETHEREUM_PRIVATE_KEY),
                this.web3.eth.getTransactionCount(this.account)
            ]);

            log.log(
                `==> updatePrice() nonce: ${nonce} sending setRate(${currency}, ${priceToSend}). currentAugmintRate[${CCY}]: ${
                    this.lastTickerCheckResult[CCY] ? this.lastTickerCheckResult[CCY].currentAugmintRate.price : "null"
                } livePrice: ${this.lastTickerCheckResult[CCY] ? this.lastTickerCheckResult[CCY].livePrice : "null"}`
            );

            const tx = this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

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
                    if (confirmationNumber === parseInt(process.env.LOG_AS_SUCCESS_AFTER_N_CONFIRMATION)) {
                        log.log(
                            `    \u2713 updatePrice() nonce: ${nonce}  txHash: ${
                                receipt.transactionHash
                            } confirmed: setRate(${currency}, ${priceToSend}) - received ${confirmationNumber} confirmations  `
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

    stop() {
        clearTimeout(this.checkTickerPriceTimer);
        if (
            this.web3 &&
            this.web3.currentProvider.connection &&
            typeof this.web3.currentProvider.connection.close === "function"
        ) {
            // connection.close only exists when websocket connection. it is required to close in order node process to stop
            this.web3.currentProvider.connection.close();
        }
    }

    exit(signal) {
        log.info(`\n*** ratesFeeder Received ${signal}. Stopping.`);
        this.stop();
    }

    getStatus() {
        const status = {
            isInitialised: this.isInitialised,
            account: this.account,
            ratesContract: this.augmintRatesInstance ? this.augmintRatesInstance._address : "null",
            augmintTokenContract: this.augmintTokenInstance ? this.augmintTokenInstance._address : "null",
            lastTickerCheckResult: this.lastTickerCheckResult
        };
        return status;
    }
}

module.exports = RatesFeeder;
