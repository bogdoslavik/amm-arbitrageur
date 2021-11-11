import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import AsyncLock from 'async-lock';

import { FlashBot, ProfitFinder } from '../typechain';
import { Network, getTokens } from './tokens';
import { getBnbPrice } from './basetoken-price';
import log from './log';
import config from './config';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function calcNetProfit(profitWei: BigNumber, address: string, baseTokens: Tokens): Promise<number> {
  console.log('')
  console.log('profitWei', profitWei.toString());
  let price = 1;
  let decimals = 6; // for USDT and USDC
  if (baseTokens.wmatic && baseTokens.wmatic.address == address) {
    price = await getBnbPrice();
    decimals = 18;
  }
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
  console.log('price:', price, 'profit:', profit, 'gas:', gasCost, 'clear profit:', clearProfit);

  return clearProfit;
}

const progress = '-\\|/';


async function main() {
  const net = Network.MATIC
  const flashBot = (await ethers.getContractAt('FlashBot', config.contractAddr)) as FlashBot;
  const finder   = (await ethers.getContractAt('ProfitFinder', config.finderAddr)) as ProfitFinder;
  const [baseTokens] = getTokens(net);

  const lock = new AsyncLock({ timeout: 2000, maxPending: 20 });

  log.info('Start arbitraging');
  let pair0: any, pair1: any, profit, baseToken;
  let turn = 0;
  let pairsCount = (await finder.pairsCount()).toNumber();
  console.log('pairsCount', pairsCount);

  while (true) {
    try {
      [pair0, pair1, profit, baseToken] = await finder.findProfit({
        gasPrice: config.gasPrice,
        gasLimit: config.gasLimit,
      });
      console.log(progress[turn % progress.length], turn++, profit.toString(), ' '.repeat(20), '\u001b[1A');
      if (profit.gt(0)) {
        console.log();
        const netProfit = await calcNetProfit(profit, baseToken, baseTokens);
        // console.log('netProfit', netProfit);
        if (netProfit && netProfit >= config.minimumProfit) {
          log.info(`Calling arbitrage for net profit: $${netProfit}`);
          try {
            // lock to prevent tx nonce overlap
            await lock.acquire('flash-bot', async () => {
              const response = await flashBot.swap(pair0, pair1, {
                gasPrice: config.gasPrice,
                gasLimit: config.finderGasLimit,
              });
              const receipt = await response.wait(1);
              log.info(`Tx: ${receipt.transactionHash}`);
              //TODO get function response and when it is false - ban pair for a while
              // console.log('receipt', receipt);
            });
          } catch (err: any) {
            if (err.message === 'Too much pending tasks' || err.message === 'async-lock timed out') {
              return;
            }
            log.error('Transaction reverted :(');
            // console.log('err', err);
          }

        }
      }
      await sleep(config.delay);
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
