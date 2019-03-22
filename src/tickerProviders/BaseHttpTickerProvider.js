require("src/env.js");
const log = require("src/log.js")("TickerProvider");
const BaseTickerProvider = require("./BaseTickerProvider.js");
const fetch = require("node-fetch");

const DEFAULT_HTTP_POLL_INTERVAL = 120000;
const DEFAULT_HTTP_FETCH_TIMEOUT = 30000;
const DEFAULT_LOG_POLL_ERROR_AGAIN_AFTER_X_MINS = 120;

class BaseHttpTickerProvider extends BaseTickerProvider {
    constructor(config) {
        super();

        this.url = config.url;
        const envPre = this.name.toUpperCase() + "_";
        this.httpPollInterval =
            config.httpPollInterval ||
            process.env[envPre + "HTTP_POLL_INTERVAL"] ||
            process.env.HTTP_POLL_INTERVAL ||
            DEFAULT_HTTP_POLL_INTERVAL;
        this.httpFetchTimeout = config.httpFetchTimeout || process.env.HTTP_FETCH_TIMEOUT || DEFAULT_HTTP_FETCH_TIMEOUT;
        this.logPollErrorAgainAfterXMins =
            config.logPollErrorAgainAfterXMins ||
            process.env.LOG_POLL_ERROR_AGAIN_AFTER_X_MINS ||
            DEFAULT_LOG_POLL_ERROR_AGAIN_AFTER_X_MINS;

        this.lastPollAttemptAt = null;
        this.lastPollErrorLoggedAt = null;
        this.pollErrorCount = 0;
    }

    async connect() {
        try {
            const connectionInfo = { url: this.url, httpPollInterval: this.httpPollInterval };
            super.connect(connectionInfo); // passing data to super is info only to be included in "connecting" event

            await this.poll(); // fetch initial ticker info

            if (this.httpPollInterval > 0) {
                this.pollIntervalTimer = setInterval(this.poll.bind(this), this.httpPollInterval);
            }

            this.emit("connected", connectionInfo, this);
        } catch (err) {
            throw new Error(`${this.name} connect failed: ${err}`); // fail big on initial connect
        }
    }

    async poll() {
        try {
            this.lastPollAttemptAt = new Date();

            const response = await fetch(this.url, { timeout: this.httpFetchTimeout });

            if (response.ok) {
                const data = await response.json();
                // implement processTickerData in provider, return min: {price} but you can include additonal info
                const newTicker = this.processTickerData(data);

                newTicker.receivedAt = new Date();

                this.isConnected = true;

                if (this.error) {
                    log.log(this.name, "poll recovered from error");
                    this.error = null;
                    this.lastPollErrorLoggedAt = null;
                }

                this.emit("tickerreceived", newTicker, this);
            } else {
                throw `fetch failed with error code: ${response.status} ${response.statusText}`;
            }
        } catch (error) {
            this.pollErrorCount++;

            const errorText = `${this.name} poll error: ${error}`;

            const lastError = this.error;
            const wasConnected = this.isConnected;
            this.error = errorText; // save for status
            this.isConnected = false;

            this.emit("providerError", errorText, this);

            if (wasConnected || lastError) {
                // this is not the first poll right after the connect so won't fail big to keep up trying for next poll
                if (
                    !this.lastPollErrorLoggedAt ||
                    this.error !== lastError ||
                    this.lastPollAttemptAt - this.lastPollErrorLoggedAt > this.logPollErrorAgainAfterXMins * 1000 * 60
                ) {
                    // This is a new error or so we log but avoid polluting the logs with repetitions
                    log.error(
                        `${errorText}. Poll will keep trying in every ${
                            this.httpPollInterval
                        } ms. Further errors of the same type are supressed for ${
                            this.logPollErrorAgainAfterXMins
                        } minutes.`
                    );

                    this.lastPollErrorLoggedAt = new Date();
                }
            } else {
                // if it's first connect then fail big..
                throw new Error(errorText);
            }
        }
    }

    disconnect() {
        super.disconnect();
        clearTimeout(this.pollIntervalTimer);

        this.emit("disconnected", this);
    }

    getStatus() {
        const stat = super.getStatus();
        return Object.assign(stat, { lastPollAttemptAt: this.lastPollAttemptAt, pollErrorCount: this.pollErrorCount });
    }
}

module.exports = BaseHttpTickerProvider;
