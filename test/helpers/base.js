/* Generic test helper functions */
const assert = require("chai").assert;

module.exports = {
    takeSnapshot,
    revertSnapshot,
    getEvents,
    assertEvent,
    assertNoEvents
};

function takeSnapshot(web3) {
    //dirty hack for web3@1.0.0 support for localhost testrpc, see https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
    if (typeof web3.currentProvider.sendAsync !== "function") {
        web3.currentProvider.sendAsync = function() {
            return web3.currentProvider.send.apply(web3.currentProvider, arguments);
        };
    }

    return new Promise(function(resolve, reject) {
        web3.currentProvider.sendAsync(
            {
                method: "evm_snapshot",
                params: [],
                jsonrpc: "2.0",
                id: new Date().getTime()
            },
            function(error, res) {
                if (error) {
                    reject(new Error("Can't take snapshot with web3\n" + error));
                } else {
                    resolve(res.result);
                }
            }
        );
    });
}

function revertSnapshot(web3, snapshotId) {
    return new Promise(function(resolve, reject) {
        web3.currentProvider.sendAsync(
            {
                method: "evm_revert",
                params: [snapshotId],
                jsonrpc: "2.0",
                id: new Date().getTime()
            },
            function(error, res) {
                if (error) {
                    // TODO: this error is not bubbling up to truffle test run :/
                    reject(new Error("Can't revert snapshot with web3. snapshotId: " + snapshotId + "\n" + error));
                } else {
                    resolve(res);
                }
            }
        );
    });
}

function getEvents(contractInstance, eventName) {
    return contractInstance.getPastEvents(eventName);
}

async function assertEvent(contractInstance, eventName, _expectedArgs) {
    let expectedArgsArray;
    if (!Array.isArray(_expectedArgs)) {
        expectedArgsArray = [_expectedArgs];
    } else {
        expectedArgsArray = _expectedArgs;
    }
    const events = await getEvents(contractInstance, eventName);

    assert(
        events.length === expectedArgsArray.length,
        `Expected ${expectedArgsArray.length} ${eventName} events from ${contractInstance.address} but received ${
            events.length
        }`
    ); // how to get contract name?

    const ret = {}; // we return values from event (useful when  custom validator passed for an id)

    events.forEach((event, i) => {
        const expectedArgs = expectedArgsArray[i];

        assert(event.event === eventName, `Expected ${eventName} event but got ${event.event}`);

        const eventArgs = event.returnValues;

        const expectedArgNames = Object.keys(expectedArgs);
        const receivedArgNames = Object.keys(eventArgs);

        assert(
            // web3 returns args in two formats <idx>: "val" and <argname>: "val"
            expectedArgNames.length === receivedArgNames.length / 2,
            `Expected ${eventName} event to have ${
                expectedArgNames.length
            } arguments, but it had ${receivedArgNames.length / 2}` // web3 returns args in two formats <idx>: "val" and <argname>: "val"
        );

        expectedArgNames.forEach(argName => {
            assert(
                typeof eventArgs[argName] !== "undefined",
                `${argName} expected in ${eventName} event but it's not found`
            );

            const expectedValue = expectedArgs[argName];
            let value;
            switch (typeof expectedValue) {
            case "function":
                value = expectedValue(eventArgs[argName]);
                break;
            case "number":
                value =
                        typeof eventArgs[argName].toNumber === "function"
                            ? eventArgs[argName].toNumber()
                            : eventArgs[argName];
                break;
            case "string":
                value =
                        typeof eventArgs[argName].toString === "function"
                            ? eventArgs[argName].toString()
                            : eventArgs[argName];
                break;
            default:
                value = eventArgs[argName];
            }

            if (typeof expectedValue !== "function") {
                assert(
                    value === expectedValue,
                    `Event ${eventName} has ${argName} arg with a value of ${value} but expected ${expectedValue}`
                );
            }
            ret[argName] = value;
        });
    });
    return ret;
}

async function assertNoEvents(contractInstance, eventName) {
    const events = await getEvents(contractInstance, eventName);
    assert(events.length === 0);
}
