/* Generic test helper functions */
const RatesFeeder = require("src/RatesFeeder.js");
const { web3 } = require("src/augmintjs/ethereumConnection.js");
const ratesFeeder = new RatesFeeder(web3, []);
const assert = require("chai").assert;

module.exports = {
    get web3() {
        return ratesFeeder.web3;
    },
    ratesFeeder: async function() {
        if (!ratesFeeder.isInitialised) {
            await ratesFeeder.init();
        }
        return ratesFeeder;
    },
    getEvents,
    assertEvent,
    assertNoEvents
};

function getEvents(contractInstance, eventName) {
    return contractInstance.getPastEvents(eventName);
    // console.log(contractInstance.events)
    // return new Promise((resolve, reject) => {
    //     contractInstance.events[eventName]().get((err, res) => {
    //         if (err) {
    //             return reject(err);
    //         }
    //
    //         resolve(res);
    //     });
    // });
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
