import { BigNumber, BigNumberish, utils } from 'ethers';
import deployer from './../.secret';

interface Config {
  contractAddr: string;
  logLevel: string;
  minimumProfit: number;
  gasPrice: BigNumber;
  gasLimit: BigNumberish;
  gasUsage: BigNumberish;
  bscScanUrl: string;
  concurrency: number;
}

const contractAddr = deployer.bot; // flash bot contract address
const gasPrice = utils.parseUnits('75', 'gwei');
const gasLimit = 3000000;
const gasUsage = 550000;

const bscScanApiKey = deployer.polygonScan; // bscscan API key
// const bscScanUrl = `https://api.bscscan.com/api?module=stats&action=bnbprice&apikey=${bscScanApiKey}`;
const bscScanUrl = `https://api.polygonscan.com/api?module=stats&action=maticprice&apikey=${bscScanApiKey}`;

const config: Config = {
  contractAddr: contractAddr,
  logLevel: 'info',
  concurrency: 50,
  // minimumProfit: 50, // in USD
  minimumProfit: 1, // in USD
  gasPrice: gasPrice,
  gasLimit: gasLimit,
  gasUsage: gasUsage,
  bscScanUrl: bscScanUrl,
};

export default config;
