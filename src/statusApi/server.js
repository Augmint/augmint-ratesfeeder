const loadEnv = require("src/helpers/loadEnv.js");
const { utils } = require("@augmint/js");

const config = loadEnv();

if (config.LOG) {
    utils.logger.level = config.LOG;
}
const log = utils.logger("statusApi");

const setExitHandler = utils.setExitHandler;
const promiseTimeout = utils.promiseTimeout;

const app = require("./app.js");
const http = require("http");
let httpServer;

const CLOSE_TIMEOUT = 5000; // how much wait on close for sockets to close
// maintain socket info to destroy all sockets on SIGINT after CLOSE_TIMEOUT time
//  so that we don't to wait server.timeOut (defult 2 mins..) when shuting down
const serverSockets = new Set();
const DEFAULT_PORT = 30000;

setExitHandler(exit, "statusApi");

function start(ratesFeeder) {
    const port = normalizePort(process.env.PORT || DEFAULT_PORT);

    app.set("port", port);
    app.locals.ratesFeeder = ratesFeeder;

    httpServer = http.createServer(app);

    httpServer.listen(port);
    httpServer.on("error", onError);
    httpServer.on("listening", onListening);

    httpServer.on("connection", socket => {
        serverSockets.add(socket);
        socket.on("close", () => {
            serverSockets.delete(socket);
        });
    });

    function normalizePort(val) {
        var port = parseInt(val, 10);

        if (isNaN(port)) {
            // named pipe
            return val;
        }

        if (port >= 0) {
            // port number
            return port;
        }

        return false;
    }

    function onError(error) {
        if (error.syscall !== "listen") {
            throw error;
        }

        const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case "EACCES":
                log.error("Error: Can't start statusApi server:" + bind + " requires elevated privileges");
                process.exit(1);
                break;
            case "EADDRINUSE":
                log.error("Error: Can't start statusApi server:" + bind + " is already in use");
                process.exit(1);
                break;
            default:
                throw error;
        }
    }

    function onListening() {
        const addr = httpServer.address();
        const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
        log.info(` \u2713 statusApi is listening on ${bind}`);
    }
}

async function exit(signal) {
    log.info(`*** statusApi Received ${signal}. Stopping.`);
    if (httpServer && httpServer.listening) {
        return promiseTimeout(CLOSE_TIMEOUT, gracefulClose()).catch(error => {
            log.info("statusApi httpserver.close timed out or error, force closing all sockets.", error);
            destroySockets(serverSockets);
            return;
        });
    }
}

async function gracefulClose() {
    return new Promise((resolve, reject) => {
        httpServer.close(err => {
            if (err) {
                const error = new Error("ERROR. statusApi can't close httpServer. Error:\n", err);
                log.error(error);
                reject(error);
            } else {
                log.debug("statusApi closed httpServer.");
                resolve();
            }
        });
    });
}

function destroySockets(sockets) {
    for (const socket of sockets.values()) {
        socket.destroy();
    }
}

module.exports = { start };
