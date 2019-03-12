require("../env.js");
// const ulog = require("ulog");
// const log = ulog("statusApi");

const httplogger = require("morgan");
const createError = require("http-errors");
const express = require("express");
const app = express();
const router = express.Router();
const statusRouter = require("./routes/status.js");

if (process.env.STATUSAPI_HTTP_LOG_LEVEL.toLowerCase().trim() !== "off") {
    app.use(httplogger(process.env.STATUSAPI_HTTP_LOG_LEVEL));
}

router.use("/status", statusRouter);

app.use("/api", router);

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createError(404));
});

app.use((err, req, res, next) => {
    res.locals.message = err.message;
    res.locals.error = err; // req.app.get("env") === "development" ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.json({ Error: err });
});

module.exports = app;
