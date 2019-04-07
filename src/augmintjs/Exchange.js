const BigNumber = require("bignumber.js");
const { cost } = require("./gas.js");
const { constants } = require("./constants.js");
const contractConnection = require("src/augmintjs/helpers/contractConnection.js");
const Contract = require("src/augmintjs/Contract.js");
const Rates = require("src/augmintjs/Rates.js");
const ExchangeArtifact = require("src/augmintjs/abiniser/abis/Exchange_ABI_d3e7f8a261b756f9c40da097608b21cd.json");

const AugmintTokenArtifact = require("src/augmintjs/abiniser/abis/TokenAEur_ABI_2ea91d34a7bfefc8f38ef0e8a5ae24a5.json");

/**
 * Augmint Exchange contract class
 * @extends Contract
 */
class Exchange extends Contract {
    constructor() {
        super();
        this.rates = null;
        this.tokenInstance = null;
    }

    async connect(ethereumConnection, exchangeAddress) {
        await super.connect(ethereumConnection, ExchangeArtifact, exchangeAddress);

        this.rates = new Rates();
        await this.rates.connect(this.ethereumConnection);
        this.tokenInstance = contractConnection.connectLatest(this.ethereumConnection, AugmintTokenArtifact);

        const [tokenAddressAtExchange, ratesAddressAtExchange] = await Promise.all([
            this.instance.methods.augmintToken().call(),
            this.instance.methods.rates().call()
        ]);

        if (ratesAddressAtExchange !== this.rates.address) {
            throw new Error(
                `Exchange: latest Rates contract deployment address ${
                    this.rates.address
                } for provided ABI doesn't match rates contract address ${ratesAddressAtExchange} at deployed Exchange contract`
            );
        }

        // TODO: replace instance reference with augmintToken.address when AugmintToken class is done
        if (tokenAddressAtExchange !== this.tokenInstance._address) {
            throw new Error(
                `Exchange: latest AugmintToken contract deployment address  ${
                    this.tokenInstance.options.address
                } for provided ABI doesn't match AugmintToken contract address ${tokenAddressAtExchange} at deployed Exchange contract`
            );
        }

        return this.instance;
    }

    /**
     * Fetches current OrderBook and returns as many matching orderIds (at current ETHFiat rate)
     * as fits into the provided gas limit.
     * The returned orderids can be passed to getMatchMultipleOrdersTx
     * @param  {number}  gasLimit   return as many matches as it fits to gasLimit based on gas cost estimate.
     * @return {Promise}            pairs of matching order id , ordered by execution sequence
                                   { buyIds: [], sellIds: [], gasEstimate }
     */
    async getMatchingOrders(gasLimit) {
        const [orderBook, bn_ethFiatRate] = await Promise.all([this.fetchOrderBook(), this.rates.getBnEthFiatRate()]);

        const matches = this.calculateMatchingOrders(
            orderBook.buyOrders,
            orderBook.sellOrders,
            bn_ethFiatRate,
            gasLimit
        );

        return matches;
    }

    /**
     * Fetches, parses and orders the current, full orderBook from Exchange
     * @return {Promise} the current, ordered orderBook in the format of:
     *                  { buyOrders: [{id, maker, direction, bn_amount (in Wei), bn_ethAmount, amount (in eth), bn_price (in PPM)],
     *                  sellOrders: [{id, maker, direction, bn_amount (wtihout decimals), amount (in AEUR), bn_price (in PPM)}]
     */
    async fetchOrderBook() {
        // TODO: handle when order changes while iterating
        const isLegacyExchangeContract = typeof this.instance.methods.CHUNK_SIZE === "function";
        const chunkSize = isLegacyExchangeContract ? constants.LEGACY_CONTRACTS_CHUNK_SIZE : constants.CHUNK_SIZE;

        const orderCounts = await this.instance.methods.getActiveOrderCounts().call({ gas: 4000000 });
        const buyCount = parseInt(orderCounts.buyTokenOrderCount, 10);
        const sellCount = parseInt(orderCounts.sellTokenOrderCount, 10);

        // retreive all orders
        let buyOrders = [];
        let queryCount = Math.ceil(buyCount / constants.LEGACY_CONTRACTS_CHUNK_SIZE);

        for (let i = 0; i < queryCount; i++) {
            const fetchedOrders = isLegacyExchangeContract
                ? await this.getOrders(constants.TOKEN_BUY, i * chunkSize)
                : await this.getOrders(constants.TOKEN_BUY, i * chunkSize, chunkSize);
            buyOrders = buyOrders.concat(fetchedOrders.buyOrders);
        }

        let sellOrders = [];
        queryCount = Math.ceil(sellCount / chunkSize);
        for (let i = 0; i < queryCount; i++) {
            const fetchedOrders = isLegacyExchangeContract
                ? await this.getOrders(constants.TOKEN_SELL, i * chunkSize)
                : await this.getOrders(constants.TOKEN_SELL, i * chunkSize, chunkSize);
            sellOrders = sellOrders.concat(fetchedOrders.sellOrders);
        }

        buyOrders.sort(this.isOrderBetter);
        sellOrders.sort(this.isOrderBetter);

        return { buyOrders, sellOrders };
    }

    async getOrders(orderDirection, offset) {
        const blockGasLimit = this.ethereumConnection.safeGasLimit;

        const isLegacyExchangeContract = typeof this.instance.methods.CHUNK_SIZE === "function";
        const chunkSize = isLegacyExchangeContract ? constants.LEGACY_CONTRACTS_CHUNK_SIZE : constants.CHUNK_SIZE;

        let result;
        if (orderDirection === constants.TOKEN_BUY) {
            result = isLegacyExchangeContract
                ? await this.instance.methods.getActiveBuyOrders(offset).call({ gas: blockGasLimit })
                : await this.instance.methods.getActiveBuyOrders(offset, chunkSize).call({ gas: blockGasLimit });
        } else {
            result = isLegacyExchangeContract
                ? await this.instance.methods.getActiveSellOrders(offset).call({ gas: blockGasLimit })
                : await this.instance.methods.getActiveSellOrders(offset, chunkSize).call({ gas: blockGasLimit });
        }

        // result format: [id, maker, price, amount]
        const orders = result.reduce(
            (res, order, idx) => {
                const bn_amount = new BigNumber(order[3]);
                if (!bn_amount.eq(0)) {
                    const parsed = {
                        id: parseInt(order[0], 10),
                        maker: "0x" + new BigNumber(order[1]).toString(16).padStart(40, "0"), // leading 0s if address starts with 0
                        bn_price: new BigNumber(order[2]),
                        bn_amount
                    };

                    parsed.price = parsed.bn_price / constants.PPM_DIV;

                    if (orderDirection === constants.TOKEN_BUY) {
                        parsed.direction = constants.TOKEN_BUY;
                        parsed.bn_ethAmount = parsed.bn_amount.div(constants.ONE_ETH_IN_WEI);
                        parsed.amount = parseFloat(parsed.bn_ethAmount);

                        res.buyOrders.push(parsed);
                    } else {
                        parsed.direction = constants.TOKEN_SELL;
                        parsed.amount = parseFloat((parsed.bn_amount / constants.DECIMALS_DIV).toFixed(2));

                        res.sellOrders.push(parsed);
                    }
                }
                return res;
            },
            { buyOrders: [], sellOrders: [] }
        );

        return orders;
    }

    isOrderBetter(o1, o2) {
        if (o1.direction !== o2.direction) {
            throw new Error("isOrderBetter(): order directions must be the same" + o1 + o2);
        }

        const dir = o1.direction === constants.TOKEN_SELL ? 1 : -1;

        return o1.price * dir > o2.price * dir || (o1.price === o2.price && o1.id > o2.id) ? 1 : -1;
    }

    /**
     * Returns a signed MatchMultiple transaction, ready to be sent with EthereumConnection.sendSignedTransaction
     * @param  {string} privateKey  Private key of the Ethereum account to sign the tx with. Include leading 0x
     * @param  {array} buyIds     a list of buy order id numners
     * @param  {array} sellIds    list of matching sell order numbers
     * @return {object}           A web3 transaction object which can be sent using EthereumConnection.sendSignedTransaction
     */
    getSignedMultipleOrdersTx(privateKey, buyIds, sellIds) {}

    /**
     * Returns a web3 transaction to match the passed buyIds and sellIds. Call .send() on the returned tx.
     * @param  {array} buyIds   array with a list of BUY order IDs (ordered)
     * @param  {array} sellIds  array with a list of SELL order IDs (ordered)
     * @return {object}         web3 transaction which can be executed with .send({account, gas})
     */
    getMatchMultipleOrdersTx(buyIds, sellIds) {
        if (sellIds.length === 0 || sellIds.length !== buyIds.length) {
            throw new Error("invalid buyIds/sellIds recevied - no ids or the the params are not equal.");
        }

        const tx = this.instance.methods.matchMultipleOrders(buyIds, sellIds);

        return tx;
    }

    /**
     * calculate matching pairs from ordered ordebook for sending in Exchange.matchMultipleOrders ethereum tx
     * @param  {object} _buyOrders     must be ordered by price descending then by id ascending
     * @param  {[type]} _sellOrders    must be ordered by price ascending then by id ascending
     * @param  {[type]} bn_ethFiatRate current ETHFiat rate to use for calculation
     * @param  {[type]} gasLimit       return as many matches as it fits to gasLimit based on gas cost estimate.
     * @return {object}                pairs of matching order id , ordered by execution sequence { buyIds: [], sellIds: [], gasEstimate }
     */
    calculateMatchingOrders(_buyOrders, _sellOrders, bn_ethFiatRate, gasLimit) {
        const sellIds = [];
        const buyIds = [];

        if (_buyOrders.length === 0 || _sellOrders.length === 0) {
            return { buyIds, sellIds, gasEstimate: 0 };
        }
        const lowestSellPrice = _sellOrders[0].price;
        const highestBuyPrice = _buyOrders[0].price;

        const buyOrders = _buyOrders
            .filter(o => o.price >= lowestSellPrice)
            .map(o => ({ id: o.id, price: o.price, bn_ethAmount: o.bn_ethAmount }));
        const sellOrders = _sellOrders
            .filter(o => o.price <= highestBuyPrice)
            .map(o => ({ id: o.id, price: o.price, bn_tokenAmount: new BigNumber(o.amount) }));

        let buyIdx = 0;
        let sellIdx = 0;
        let gasEstimate = 0;
        let nextGasEstimate = cost.MATCH_MULTIPLE_FIRST_MATCH_GAS;

        while (buyIdx < buyOrders.length && sellIdx < sellOrders.length && nextGasEstimate <= gasLimit) {
            const sellOrder = sellOrders[sellIdx];
            const buyOrder = buyOrders[buyIdx];
            sellIds.push(sellOrder.id);
            buyIds.push(buyOrder.id);

            let tradedEth;
            let tradedTokens;

            const matchPrice = buyOrder.id > sellOrder.id ? sellOrder.price : buyOrder.price;

            buyOrder.bn_tokenValue = bn_ethFiatRate
                .div(matchPrice)
                .mul(buyOrder.bn_ethAmount)
                .round(2);

            sellOrder.bn_ethValue = sellOrder.bn_tokenAmount
                .mul(matchPrice)
                .div(bn_ethFiatRate)
                .round(18);

            if (sellOrder.bn_tokenAmount.lt(buyOrder.bn_tokenValue)) {
                tradedEth = sellOrder.bn_ethValue;
                tradedTokens = sellOrder.bn_tokenAmount;
            } else {
                tradedEth = buyOrder.bn_ethAmount;
                tradedTokens = buyOrder.bn_tokenValue;
            }

            // console.debug(
            //     `MATCH:  BUY: id: ${buyOrder.id} price: ${
            //         buyOrder.price
            //     } Amount: ${buyOrder.bn_ethAmount.toString()} ETH tokenValue: ${buyOrder.bn_tokenValue.toString()}
            // SELL: id: ${sellOrder.id} price: ${
            //         sellOrder.price
            //     } Amount: ${sellOrder.bn_tokenAmount.toString()} AEUR  ethValue: ${sellOrder.bn_ethValue.toString()}
            // Traded: ${tradedEth.toString()} ETH <-> ${tradedTokens.toString()} AEUR @${(matchPrice * 100).toFixed(
            //         2
            //     )}% on ${bn_ethFiatRate.toString()} ETHEUR`
            // );

            buyOrder.bn_ethAmount = buyOrder.bn_ethAmount.sub(tradedEth);
            buyOrder.bn_tokenValue = buyOrder.bn_tokenValue.sub(tradedTokens);

            if (buyOrder.bn_ethAmount.eq(0)) {
                buyIdx++;
            }

            sellOrder.bn_ethValue = sellOrder.bn_ethValue.sub(tradedEth);
            sellOrder.bn_tokenAmount = sellOrder.bn_tokenAmount.sub(tradedTokens);
            if (sellOrder.bn_tokenAmount.eq(0)) {
                sellIdx++;
            }

            gasEstimate = nextGasEstimate;
            nextGasEstimate += cost.MATCH_MULTIPLE_ADDITIONAL_MATCH_GAS;
        }

        return { buyIds, sellIds, gasEstimate };
    }
}

module.exports = Exchange;
