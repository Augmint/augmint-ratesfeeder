# Augmint RatesFeeder - development environment

## Install

Instructions about the dev environment setup for Ratesfeeder development.

For contracs development see [augmint-contracts repo](https://github.com/Augmint/augmint-contracts)

For UI development see [augmint-web repo](https://github.com/Augmint/augmint-web)

### OSX / Linux

1.  [Git](https://git-scm.com/download)

1.  [nodejs](https://nodejs.org/en/download/)  
    NB: check supported node version in [package.json](../package.json)

    Installing nodejs with [n node version manager](https://github.com/tj/n):

    ```
    npm install -g n
    n <node version, eg: 10.15.3>
    ```

1.  Yarn: `npm install -g yarn@<yarn version, e.g. 1.15.2>`  
    NB: check required yarn version in [package.json](../package.json)

1.  [Docker cli](https://hub.docker.com/search/?type=edition&offering=community)

1.  ```
    git clone https://github.com/Augmint/augmint-ratesfeeder.git
    cd augmint-ratesfeeder
    yarn install
    ```

### Windows

_Note: windows install was not tested since a while, update on it is welcome_

1.  [Git Bash](https://git-for-windows.github.io/)
1.  [Git](https://git-scm.com/download) (if you haven't installed it as part of Git Bash in previous step)
1.  [nodejs](https://nodejs.org/en/download/)  
    NB: check supported node version in [package.json](../package.json)

    Installing nodejs with [Node Version Manager(NVM)](https://github.com/coreybutler/nvm-windows/releases):

    ```
    nvm install <node version number, eg: 10.15.3>
    nvm use 10.15.3
    ```

1.  Yarn: `npm install -g yarn@<yarn version, e.g. 1.15.2>`  
    NB: check required yarn version in [package.json](../package.json)

1.  [Docker cli](https://hub.docker.com/search/?type=edition&offering=community)

1.  in Git bash:

    ```
    git clone https://github.com/Augmint/augmint-ratesfeeder.git
    cd augmint-ratesfeeder
    yarn install
    ```

    _If python already installed but npm does not find it: npm --add-python-to-path='true' --debug install --global windows-build-tools (as administrator)_

## Launch

### Update to latest augmint-ratesfeeder

```
git pull
yarn install # if there were any node package changes in packages.json
```

### Tests

1.  Start ganache-cli (formerly testrpc)

    ```
    yarn ganache:start
    ```

2.  Run tests

    ```
    yarn test
    ```

### Feeding

#### Local

```
yarn ganache:start
```

```
yarn start
```

#### Production (rinkeby or mainnet)

See `.env.production` and set your keys in `.env.production.local`

```
yarn start:production
```
