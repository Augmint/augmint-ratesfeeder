module.exports = setExitHandler;

const log = require("src/log.js")("sigintHandler");
const promiseTimeout = require("src/helpers/promiseTimeout.js");
const DEFAULT_EXIT_TIMEOUT = 10000; // how much to wait before timing out disconnect (in ms)
const SIGNALS = ["SIGINT", "SIGQUIT", "SIGTERM"];

function setExitHandler(exitHandler, name) {
    SIGNALS.forEach(signal => {
        process.on(signal, async signal => {
            await promiseTimeout(DEFAULT_EXIT_TIMEOUT, exitHandler(signal)).catch(error => {
                // most likely timeout
                log.warn(name, "exit failed with Error: ", error);
                process.exitCode = 999;
            });
            log.debug(name, "exit success");
        });
    });
}
