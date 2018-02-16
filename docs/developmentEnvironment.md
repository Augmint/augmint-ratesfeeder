# Augmint RatesFeeder - development environment

## Install

These instructions are about the dev environment for rates feeder (oracle) development.
For contracs development see [augmint-contracts repo](https://github.com/Augmint/augmint-contracts)
For UI development see [augmint-web repo](https://github.com/Augmint/augmint-web)

### OSX

_NB: these steps are likely to work on linux too but it's not tested yet_

1. [Git](https://git-scm.com/download)
1. [Ethereum CLI](https://www.ethereum.org/cli)
1. [nodejs](https://nodejs.org/en/download/) v8.5.0  
   _use version 8.5.0, ganache regularly crashes with newer version (FE also works with 8.9.4)_
1. then:
    ```
    git clone https://github.com/Augmint/augmint-ratesfeeder.git
    cd augmint-ratesfeeder
    npm install
    git clone https://github.com/Augmint/augmint-contracts.git
    cd augmint-contracts
    npm install
    ```

### Windows

_Note: It is recommended to use PowerShell (win+X => powershell)_

1. [Git Bash](https://git-for-windows.github.io/) (required for truffle & yarn start)
1. [Git](https://git-scm.com/download) (if you haven't installed it as part of Git Bash in previous step)
1. [Ethereum CLI](https://www.ethereum.org/cli) - including development tools
1. [Node Version Manager(NVM)](https://github.com/coreybutler/nvm-windows/releases)
1. [nodejs](https://nodejs.org/en/download/) v8.5.0 or from command line:
   ```
   nvm install 8.5.0
   nvm use 8.5.0
   ```
1. Truffle Ethereum Framework:
   ```
   npm install truffle
   ```
1. [Ganache GUI (TestRPC)](http://truffleframework.com/ganache/) or from command line:
   ```
   npm install -g ganache-cli
   ```
   _Config details in runganche.bat_
   _TODO: configure without --global option_

1. Get the source code:
    ```
    git clone https://github.com/Augmint/augmint-ratesfeeder.git
    cd augmint-ratesfeeder
    npm install
    git clone https://github.com/Augmint/augmint-contracts.git
    cd augmint-contracts
    npm install
    ```

    _If python already installed but npm does not find it: npm --add-python-to-path='true' --debug install --global windows-build-tools (as administrator)_

## Launch

### 1. Update to latest augmint-ratesfeeder

```
git pull
npm install # if there were any node package changes in packages.json
```

### 2. Setup augmint smartcontracts

See the instructions in: https://github.com/Augmint/augmint-contracts/blob/master/docs/developmentEnvironment.md

### 3. Run tests (TODO)

_Creates a local http server, that emulates different price changes. NOT WOKRING YET_
```
truffle test
```

### 4. Feeding

```
npm start
```
