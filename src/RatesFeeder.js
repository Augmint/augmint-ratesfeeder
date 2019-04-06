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

require("src/augmintjs/helpers/env.js");
const log = require("src/augmintjs/helpers/log.js")("ratesFeeder");
const setExitHandler = require("src/augmintjs/helpers/sigintHandler.js");
const contractConnection = require("src/augmintjs/helpers/contractConnection.js");
const promiseTimeout = require("src/augmintjs/helpers/promiseTimeout.js");
const TokenAEur = require("src/augmintjs/abiniser/abis/TokenAEur_ABI_2ea91d34a7bfefc8f38ef0e8a5ae24a5.json");
const Rates = require("src/augmintjs/Rates.js");
const { cost } = require("src/augmintjs/gas.js");

const CCY = "EUR"; // only EUR is suported by TickerProvider providers ATM
const LIVE_PRICE_DIFFERENCE_DECIMALS = 4; // rounding live price % difference to 2 decimals

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
    constructor(ethereumConnection, tickers) {
        this.tickers = tickers; // array of TickerProvider objects
        // list of tickernames:
        this.tickerNames = this.tickers.reduce(
            (accum, ticker, idx) => (idx == 0 ? ticker.name : accum + ", " + ticker.name),
            ""
        );
        this.ethereumConnection = ethereumConnection;
        this.web3 = ethereumConnection.web3;
        this.isInitialised = false;
        this.isStopping = false;
        this.decimals = null;
        this.rates = null;
        this.augmintTokenInstance = null;
        this.checkTickerPriceTimer = null;
        this.account = null;
        this.lastTickerCheckResult = {};
        this.checkTickerPriceError = null; // to store last error and supress loggin repeating errors

        setExitHandler(this.exit.bind(this), "RatesFeeder");
    }

    async init() {
        this.isStopping = false;

        this.account = process.env.RATESFEEDER_ETHEREUM_ACCOUNT;

        if (!this.web3.utils.isAddress(this.account)) {
            throw new Error("Invalid RATESFEEDER_ETHEREUM_ACCOUNT: " + this.account);
        }

        this.rates = new Rates();

        [, this.augmintTokenInstance] = await Promise.all([
            this.rates.connect(this.ethereumConnection),
            contractConnection.connectLatest(this.ethereumConnection, TokenAEur)
        ]);

        this.decimals = await this.augmintTokenInstance.methods.decimals().call();

        // Schedule first check
        this.checkTickerPriceTimer =
            process.env.RATESFEEDER_CHECK_TICKER_PRICE_INTERVAL > 0
                ? setTimeout(this.checkTickerPrice.bind(this), process.env.RATESFEEDER_CHECK_TICKER_PRICE_INTERVAL)
                : null;

        this.isInitialised = true;
        log.info(
            // IMPORTANT: NEVER expose keys even not in logs!
            `** RatesFeedeer started with settings:
            RATESFEEDER_ETHEREUM_ACCOUNT: ${process.env.RATESFEEDER_ETHEREUM_ACCOUNT}
            RATESFEEDER_ETHEREUM_PRIVATE_KEY: ${
    process.env.RATESFEEDER_ETHEREUM_PRIVATE_KEY ? "[secret]" : "not provided"
}
            RATESFEEDER_LIVE_PRICE_THRESHOLD_PT: ${process.env.RATESFEEDER_LIVE_PRICE_THRESHOLD_PT}
            RATESFEEDER_SETRATE_TX_TIMEOUT: ${process.env.RATESFEEDER_SETRATE_TX_TIMEOUT}
            RATESFEEDER_CHECK_TICKER_PRICE_INTERVAL: ${process.env.RATESFEEDER_CHECK_TICKER_PRICE_INTERVAL}
            Ticker providers: ${this.tickerNames}
            AugmintToken contract: ${this.augmintTokenInstance._address}
            Rates contract: ${this.rates.address}`
        );
    }

    // check current price from different exchanges and update Augmint price on chain if difference is beyond threshold
    // filters out bad prices, errors, and returns with the avarage
    async checkTickerPrice() {
        try {
            log.debug("==> checkTickerPrice() tickers:");

            this.tickers.forEach(t => {
                log.debug(
                    "    ",
                    t.name,
                    t.lastTicker ? t.lastTicker.lastTradePrice : "undefined",
                    t.lastTicker ? t.lastTicker.vwap : "undefined",
                    t.lastTicker ? t.lastTicker.receivedAt : "undefined"
                );
            });

            if (!(await this.ethereumConnection.isConnected())) {
                log.debug("checkTickerPrice() - Ethereum is not connected. Skipping Augmint price check. ");
            } else {
                const currentAugmintRate = await this.rates.getAugmintRate(CCY);

                const livePrice = this.calculateAugmintPrice(this.tickers);
                const livePriceDifference =
                    livePrice > 0
                        ? parseFloat(
                            (Math.abs(livePrice - currentAugmintRate.rate) / currentAugmintRate.rate).toFixed(
                                LIVE_PRICE_DIFFERENCE_DECIMALS
                            )
                        )
                        : null;

                log.debug(
                    `    checkTickerPrice() currentAugmintRate[${CCY}]: ${
                        currentAugmintRate.rate
                    } livePrice: ${livePrice} livePriceDifference: ${(livePriceDifference * 100).toFixed(2)} %`
                );

                const tickersInfo = this.tickers.map(t => t.getStatus());
                this.lastTickerCheckResult.checkedAt = new Date();
                this.lastTickerCheckResult[CCY] = {
                    currentAugmintRate,
                    livePrice,
                    livePriceDifference,
                    tickersInfo
                };

                if (livePrice > 0) {
                    if (livePriceDifference * 100 > parseFloat(process.env.RATESFEEDER_LIVE_PRICE_THRESHOLD_PT)) {
                        await promiseTimeout(
                            process.env.RATESFEEDER_SETRATE_TX_TIMEOUT,
                            this.updatePrice(CCY, livePrice)
                        ).catch(error => {
                            // NB: it's not necessarily an error, ethereum network might be just slow.
                            // we still schedule our next check which will send an update at next tick of checkTickerPrice()
                            log.error("updatePrice failed with Error: ", error);
                        });
                    }
                } else {
                    log.warn("RatesFeeder couldn't get price from any sources. Not updating price info");
                }
                if (this.checkTickerPriceError) {
                    this.checkTickerPriceError = null;
                    log.warn(" RatesFeeder checkTickerPrice() success - recovered from error");
                }
            }
        } catch (error) {
            if (this.checkTickerPriceError !== error.toString()) {
                this.checkTickerPriceError = error.toString();
                log.warn(
                    " RatesFeeder checkTickerPrice() failed. Logging the same are will be supressed for future attempts.",
                    error.toString()
                );
            }
        }

        if (!this.isStopping) {
            // Schedule next check
            this.checkTickerPriceTimer =
                process.env.RATESFEEDER_CHECK_TICKER_PRICE_INTERVAL > 0
                    ? setTimeout(this.checkTickerPrice.bind(this), process.env.RATESFEEDER_CHECK_TICKER_PRICE_INTERVAL)
                    : null;
        }
    }

    calculateAugmintPrice(tickers) {
        // ignore 0 or null prices (exchange down or no price info yet)
        const prices = tickers
            .filter(ticker => ticker.lastTicker && ticker.lastTicker.lastTradePrice > 0)
            .map(t => t.lastTicker.lastTradePrice);
        let augmintPrice = median(prices);

        augmintPrice = parseFloat(augmintPrice.toFixed(this.decimals));

        return augmintPrice === 0 ? null : augmintPrice;
    }

    /* Update price on chain.
        price provided rounded to AugmintToken.decimals first */
    async updatePrice(currency, price) {
        try {
            const setRateTx = this.rates.getSetRateTx(currency, price);
            const encodedABI = setRateTx.encodeABI();

            const txToSign = {
                from: this.account,
                to: this.rates.address,
                gas: cost.SET_RATE_GAS_LIMIT,
                data: encodedABI
            };

            const [signedTx, nonce] = await Promise.all([
                this.web3.eth.accounts.signTransaction(txToSign, process.env.RATESFEEDER_ETHEREUM_PRIVATE_KEY),
                this.ethereumConnection.getAccountNonce(this.account)
            ]);

            log.log(
                `==> updatePrice() nonce: ${nonce} sending setRate(${currency}, ${price}). currentAugmintRate[${CCY}]: ${
                    this.lastTickerCheckResult[CCY] ? this.lastTickerCheckResult[CCY].currentAugmintRate.rate : "null"
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
                            } confirmed: setRate(${currency}, ${price}) - received ${confirmationNumber} confirmations  `
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
                       rates.setRate(${currency}, ${price}, {nonce: ${nonce}})
                       receipt:
                       ${JSON.stringify(receipt, 3, null)}`);
            }

            // TODO: ganache with websocket hangs forever (b/c no confirmations on ganache)
        } catch (err) {
            log.error(err);
        }
    }

    async stop() {
        this.isStopping = true;
        clearTimeout(this.checkTickerPriceTimer);
    }

    async exit(signal) {
        log.info(`*** ratesFeeder Received ${signal}. Stopping.`);
        await this.stop();
    }

    getStatus() {
        const status = {
            isInitialised: this.isInitialised,
            account: this.account,
            ratesContract: this.rates ? this.rates.address : "null",
            augmintTokenContract: this.augmintTokenInstance ? this.augmintTokenInstance._address : "null",
            lastTickerCheckResult: this.lastTickerCheckResult
        };
        return status;
    }
}

module.exports = RatesFeeder;
