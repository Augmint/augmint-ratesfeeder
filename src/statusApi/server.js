require("../env.js");
const ulog = require("ulog");
const log = ulog("statusApi");
const app = require("./app.js");
const http = require("http");
let httpServer;

const DEFAULT_PORT = 30000;

function start(ratesFeeder) {
    ["SIGINT", "SIGHUP", "SIGTERM"].forEach(signal => process.on(signal, signal => exit(signal)));
    const port = normalizePort(process.env.PORT || DEFAULT_PORT);
    app.set("port", port);
    app.locals.ratesFeeder = ratesFeeder;

    httpServer = http.createServer(app);

    httpServer.listen(port);
    httpServer.on("error", onError);
    httpServer.on("listening", onListening);

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

    function exit(signal) {
        log.info(`*** statusApi Received ${signal}. Stopping.`);
        if (httpServer.listening) {
            httpServer.close(err => {
                if (err) {
                    log.error("ERROR. statusApi can't close httpServer. exiting. Error:", err);
                    process.exit(1);
                } else {
                    log.debug("statusApi closed httpServer connections.");
                }
            });
        }
    }
}

module.exports = { start };
