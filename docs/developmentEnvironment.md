# Augmint RatesFeeder - development environment

## Install

These instructions are about the dev environment for rates feeder (oracle) development.
For contracs development see [augmint-contracts repo](https://github.com/Augmint/augmint-contracts)
For UI development see [augmint-web repo](https://github.com/Augmint/augmint-web)

### OSX / Linux

1.  [Git](https://git-scm.com/download)
1.  [Ethereum CLI](https://www.ethereum.org/cli)
1.  Install [nodejs](https://nodejs.org/en/download/) - _tested with v8.11.1 LTS_

    or install nodejs with [n node version manager](https://github.com/tj/n):

    ```
    npm install -g n
    n 8.11.1
    ```

1.  Install yarn if you don't have it: `npm install -g yarn`
1.  ```
    git clone https://github.com/Augmint/augmint-ratesfeeder.git --recurse-submodules
    cd augmint-ratesfeeder
    yarn install
    cd augmint-contracts
    git checkout master
    yarn install
    ```

### Windows

_Note: It is recommended to use PowerShell (win+X => powershell)_

1.  [Git Bash](https://git-for-windows.github.io/) (required for truffle & yarn start)
1.  [Git](https://git-scm.com/download) (if you haven't installed it as part of Git Bash in previous step)
1.  [Ethereum CLI](https://www.ethereum.org/cli) - including development tools
1.  [Node Version Manager(NVM)](https://github.com/coreybutler/nvm-windows/releases)
1.  [nodejs](https://nodejs.org/en/download/) - _tested with v8.11.1 LTS_

    or install nodejs with [Node Version Manager(NVM)](https://github.com/coreybutler/nvm-windows/releases):

    ```
    nvm install 8.11.1
    nvm use 8.11.1
    ```

1.  Install yarn if you don't have it: `npm install -g yarn`
1.  Get the source code:

    ```
    git clone https://github.com/Augmint/augmint-ratesfeeder.git --recurse-submodules
    cd augmint-ratesfeeder
    yarn install
    cd augmint-contracts
    git checkout master
    yarn install
    ```

    _If python already installed but npm does not find it: npm --add-python-to-path='true' --debug install --global windows-build-tools (as administrator)_

## Launch

### 1. Update to latest augmint-ratesfeeder

```
git pull
yarn install # if there were any node package changes in packages.json
```

### 2. Update to latest augmint contract

```
cd augmint-contracts
git checkout master
git pull
yarn install # if there were any node package changes in packages.json
```

### 3. Tests

1.  Start ganache-cli (formerly testrpc)  
    `yarn contracts:runmigrate`  
    or  
    `yarn ganache:run` and in separate console:  
    `yarn contracts:migrate`

1.  Run tests  
    _Creates a local http server, that emulates different price changes. NOT WOKRING YET_

    ```
    truffle test
    ```

### 4. Feeding

```
yarn start
```
