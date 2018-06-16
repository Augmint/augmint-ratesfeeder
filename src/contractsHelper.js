module.exports = {
    connectLatest
};

async function connectLatest(web3, abiFile) {
    const contractName = abiFile.contractName;
    const abiVersionHash = abiFile.abiHash;
    const networkId = parseInt(await web3.eth.net.getId(), 10);

    const deploysFile = getDeploysFile(networkId, contractName);

    if (!deploysFile.deployedAbis[abiVersionHash] || !deploysFile.deployedAbis[abiVersionHash].latestDeployedAddress) {
        throw new Error(
            `Couldn't find deployment info for ${contractName} with abi version ${abiVersionHash} in ${
                deploysFile._fileName
            }`
        );
    }
    const contractAddress = deploysFile.deployedAbis[abiVersionHash].latestDeployedAddress;

    return new web3.eth.Contract(abiFile.abi, contractAddress);
}

function getDeploysFile(networkId, contractName) {
    const deploysFileName = `./abiniser/deployments/${networkId}/${contractName}_DEPLOYS.json`;
    let deploysFile;

    try {
        /* must provide fileName string again for webpack (needs to be statically analysable) */
        deploysFile = require(`./abiniser/deployments/${networkId}/${contractName}_DEPLOYS.json`);
    } catch (error) {
        throw new Error(`Couldn't import deployment file ${deploysFileName} for ${contractName}\n${error}`);
    }
    deploysFile._fileName = deploysFileName;
    return deploysFile;
}
