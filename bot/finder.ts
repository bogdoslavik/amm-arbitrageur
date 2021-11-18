import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
// import AsyncLock from 'async-lock';

import { FlashBot, ProfitFinder } from '../typechain';
import { Network, getTokens, tryLoadPairs } from './tokens';
import { getBnbPrice } from './basetoken-price';
import log from './log';
import config from './config';
import { toLower, toNumber } from 'lodash';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function calcNetProfit(profitWei: BigNumber, address: string, baseTokens: Tokens): Promise<number> {
  // console.log('address', address, 'wmatic', baseTokens.wmatic.address);
  // console.log('profitWei', profitWei.toString());
  let price = 1;
  let decimals = 6; // for USDT and USDC
  if (baseTokens.wmatic && toLower(baseTokens.wmatic.address) == toLower(address)) {
    price = await getBnbPrice();
    decimals = 18;
  }
  // console.log('decimals   :', decimals);
  // console.log('price      :', price);
  const profitCents = profitWei.mul(100).div(BigNumber.from(10).pow(decimals));
  // console.log('profitCents:', profitCents.toString());
  const profit = profitCents.toNumber() * price / 100;
  // console.log('profit     :', profit);

  const gasCost = price * parseFloat(ethers.utils.formatEther(config.gasPrice)) *
    (config.gasUsage as number);
  // console.log('gasCost    :', gasCost);
  const clearProfit = profit-gasCost
  // console.log('clearProfit:', clearProfit);
  console.log(`price: ${price} profit: ${profit} gas: ${gasCost} clear profit: $${clearProfit.toFixed(2)}`, '\u001b[1A');

  return clearProfit;
}

const progress = '-\\|/';

function time(): number {
  return (new Date()).getTime();
}

interface Bans {
  [key: string]: number;
}

async function main() {
  const net = Network.MATIC

  const pairs = await tryLoadPairs(net);
  const pairToSymbols: any = { '0x0000000000000000000000000000000000000000' : 'No profit'}
  for (const i in pairs) {
    const pair = pairs[i]
    pairToSymbols[pair.pairs[0]] = pair.symbols;
    pairToSymbols[pair.pairs[1]] = pair.symbols;
  }

  const flashBot = (await ethers.getContractAt('FlashBot', config.contractAddr)) as FlashBot;
  const finder   = (await ethers.getContractAt('ProfitFinder', config.finderAddr)) as ProfitFinder;
  const [baseTokens] = getTokens(net);

  const bans:Bans = {};

  // const lock = new AsyncLock({ timeout: 2000, maxPending: 20 });

  log.info('Start arbitraging');
  let pair0: any, pair1: any, profit, baseToken;
  let turn = 0;
  let pairsCount = (await finder.pairsCount()).toNumber();
  log.info(`Finder pairs count: ${pairsCount}`);

  while (true) {
    try {
      await sleep(config.finderDelay);

      [pair0, pair1, profit, baseToken] = await finder.findProfit({
        gasPrice: config.gasPrice,
        gasLimit: config.finderGasLimit,
      });
      console.log(progress[turn % progress.length], turn++, pairToSymbols[pair0], profit.toString(), ' '.repeat(40), '\u001b[1A');
      if (profit.gt(0)) {

        const bannedTo: number|undefined = bans[pair0+pair1];
        const banMs = toNumber(bannedTo) - time();
        if (banMs>0) {
          console.info(`Banned for ${banMs/1000} sec ${' '.repeat(30)}`)
          continue
        }
        delete bans[pair0+pair1]

        //console.log();
        const netProfit = await calcNetProfit(profit, baseToken, baseTokens);
        // console.log('netProfit', netProfit);
        if (netProfit && netProfit >= config.minimumProfit) {
          log.info(`Calling arbitrage for net profit: ${pairToSymbols[pair0]} $${netProfit.toFixed(2)}`);
          try {
            // lock to prevent tx nonce overlap
            // await lock.acquire('flash-bot', async () => {
              const response = await flashBot.swap(pair0, pair1, {
                gasPrice: config.gasPrice,
                gasLimit: config.gasLimit,
              });
              const receipt = await response.wait(1);
              log.info(`Tx: ${receipt.transactionHash}`);
              //TODO get function response and when it is false - ban pair for a while
              // console.log('receipt', receipt);
            // });
          } catch (err: any) {
            log.error('Transaction reverted :(');
            bans[pair0+pair1] = (new Date()).getTime() + config.banTimeMs ; // add pair to bans
            // console.log('err', err);
          }

        }
      }
    } catch (e) {
      log.error(e);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('MAIN:', err);
    throw err;
    //process.exit(1);
  });
