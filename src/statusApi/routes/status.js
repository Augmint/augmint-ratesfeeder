const express = require("express");
const router = express.Router();

/* GET overall status. */
router.get("/", (req, res, next) => {
    const rf = req.app.locals.ratesFeeder;
    res.json(rf.getStatus());
});

module.exports = router;
