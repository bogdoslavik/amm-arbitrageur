import { BigNumber, BigNumberish, utils } from 'ethers';
import deployer from './../.secret';

interface Config {
  contractAddr: string;
  finderAddr: string;
  logLevel: string;
  minimumProfit: number;
  gasPrice: BigNumber;
  gasLimit: BigNumberish;
  finderGasLimit: BigNumberish;
  gasUsage: BigNumberish;
  bscScanUrl: string;
  concurrency: number;
  delay: number;
  finderDelay: number;
  banTimeMs: number;
}

const contractAddr = deployer.bot; // flash bot contract address
const finderAddr = deployer.finder; // finder contract address
const gasPrice = utils.parseUnits('200', 'gwei');
const gasLimit = 1500000;
const finderGasLimit = 15000000;
const gasUsage = 700000; // Overall gas usage by arbitrage() func

const bscScanApiKey = deployer.polygonScan; // bsc scan API key
// const bscScanUrl = `https://api.bscscan.com/api?module=stats&action=bnbprice&apikey=${bscScanApiKey}`;
const bscScanUrl = `https://api.polygonscan.com/api?module=stats&action=maticprice&apikey=${bscScanApiKey}`;

const config: Config = {
  contractAddr: contractAddr,
  finderAddr,
  logLevel: 'info',
  concurrency: 50,
  // minimumProfit: 50, // in USD
  minimumProfit: 0.20, // in USD
  gasPrice: gasPrice,
  gasLimit: gasLimit,
  finderGasLimit: finderGasLimit,
  gasUsage: gasUsage,
  bscScanUrl: bscScanUrl,
  delay: 500,
  finderDelay: 500,
  banTimeMs: 60*60*1000,
};

export default config;
