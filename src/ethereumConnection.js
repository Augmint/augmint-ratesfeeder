require("src/env.js");
const log = require("src/log.js")("runFeeder");
const setExitHandler = require("src/helpers/sigintHandler.js");
const Web3 = require("web3");

module.exports = {
    get web3() {
        return web3;
    }
};

let web3;

setExitHandler(_exit, "ethereumConnection");

log.info(
    // IMPORTANT: NEVER expose keys even not in logs!
    `** ethereumConnection starting with settings:
    PROVIDER_TYPE: ${process.env.PROVIDER_TYPE}
    PROVIDER_URL: ${process.env.PROVIDER_URL}
    INFURA_PROJECT_ID: ${
    process.env.INFURA_PROJECT_ID
        ? process.env.INFURA_PROJECT_ID.substring(0, 4) + "... rest hidden"
        : "not provided"
}
    LOG_AS_SUCCESS_AFTER_N_CONFIRMATION: ${process.env.LOG_AS_SUCCESS_AFTER_N_CONFIRMATION}`
);

const projectId = process.env.INFURA_PROJECT_ID || "";

switch (process.env.PROVIDER_TYPE) {
case "http": {
    web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL + projectId));
    break;
}
case "websocket": {
    web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.PROVIDER_URL + projectId));
    break;
}
default:
    throw new Error(process.env.PROVIDER_TYPE + " is not supported yet");
}

//dirty hack for web3@1.0.0 support for localhost testrpc, see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
if (typeof web3.currentProvider.sendAsync !== "function") {
    web3.currentProvider.sendAsync = function() {
        return web3.currentProvider.send.apply(web3.currentProvider, arguments);
    }.bind(this);
}

function stop() {
    web3.currentProvider.connection.close();
}

function _exit(signal) {
    log.info(`*** EthereumConnection received ${signal}. Stopping.`);
    stop();
}
