describe("MatchMaker", () => {
    it("should not call multimatch at startup when no matching orders");

    it("should call multimatch at startup when matching orders");

    it("should not call multimatch when new order doesn't match");

    it("should call multimatch when new order  match");

    it("should queue next matching when new order lands while processing previous");

    it("should execute next matching when previous timedout");

    it("should execute next matching when previous errored");

    it("should recover after web3 connection lost");
});
