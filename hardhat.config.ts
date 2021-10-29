import { task, HardhatUserConfig } from 'hardhat/config';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-waffle';
import "@nomiclabs/hardhat-etherscan";

import deployer from './.secret';

// const BSC_RPC = 'https://bsc-dataseed.binance.org/';
// const BSC_RPC = 'https://bsc-dataseed1.defibit.io/';
// const BSC_RPC = 'https://bsc-dataseed1.ninicoin.io/';
const BSC_RPC = 'https://bsc-dataseed3.binance.org/';
const BSC_Testnet_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const matic_RPC = "https://polygon-mainnet.g.alchemy.com/v2/" + deployer.alchemyKeyPolygon;
const forks: {[index: string]:any} = {
  'bsc': BSC_RPC,
  'bsc-test': BSC_Testnet_RPC,
  'matic': matic_RPC,
}

const fork_RPC = forks[deployer.fork];
console.log('deployer.fork', deployer.fork);

const config: HardhatUserConfig = {
  solidity: { version: '0.7.6' },
  networks: {
    hardhat: {
      // loggingEnabled: true,
      forking: {
        url: fork_RPC,
        enabled: true,
      },
      accounts: {
        accountsBalance: '1000000000000000000000000', // 1 mil ether
      },
    },
    bscTestnet: {
      url: BSC_Testnet_RPC,
      chainId: 0x61,
      accounts: [deployer.private],
    },
    bsc: {
      url: BSC_RPC,
      chainId: 0x38,
      accounts: [deployer.private],
    },
    matic: {
      url: matic_RPC,
      chainId: 137,
      accounts: [deployer.private],
    },
  },
  mocha: {
    timeout: 40000,
  },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = config;
