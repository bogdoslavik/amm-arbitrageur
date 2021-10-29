import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import pool from '@ricokahler/pool';
import AsyncLock from 'async-lock';

import { FlashBot } from '../typechain/FlashBot';
import { Network, tryLoadPairs, getTokens } from './tokens';
import { getBnbPrice } from './basetoken-price';
import log from './log';
import config from './config';
import lodash from 'lodash';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function calcNetProfit(profitWei: BigNumber, address: string, baseTokens: Tokens): Promise<number> {
  let price = 1;
  if (baseTokens.wmatic && baseTokens.wmatic.address == address) {
    price = await getBnbPrice();
  }
  let profit = parseFloat(ethers.utils.formatEther(profitWei));
  profit = profit * price;

  const gasCost = price * parseFloat(ethers.utils.formatEther(config.gasPrice)) * (config.gasLimit as number);
  return profit - gasCost;
}

let turn = 0;
let progress = '-\\|/';


function arbitrageFunc(flashBot: FlashBot, baseTokens: Tokens) {
  const lock = new AsyncLock({ timeout: 2000, maxPending: 20 });
  return async function arbitrage(pair: ArbitragePair) {
    const [pair0, pair1] = pair.pairs;

    let res: [BigNumber, string] & {
      profit: BigNumber;
      baseToken: string;
    };
    try {
      res = await flashBot.getProfit(pair0, pair1, {
        gasPrice: config.gasPrice,
        gasLimit: config.gasLimit,
      });
      log.debug(`Profit on ${pair.symbols}: ${ethers.utils.formatEther(res.profit)}`);
    } catch (err) {
      if (err.message.startsWith('cannot estimate gas;')) {
        console.log(`Cannot estimate gas for ${pair.symbols}`, ' '.repeat(20), '\u001b[1A')
        //lodash.remove(pairs, p => p==pair);
        return;
      }
      log.error(pair.symbols, err);
      return;
    }

    if (res.profit.gt(BigNumber.from('0'))) {
      const netProfit = await calcNetProfit(res.profit, res.baseToken, baseTokens);
      console.log(progress[turn%progress.length ], turn++, pairs.length, pair.symbols, netProfit, ' '.repeat(20), '\u001b[1A');
      // console.log(pair.symbols, netProfit );
      if (!netProfit || netProfit < config.minimumProfit) {
        return;
      }

      log.info(`Calling flash arbitrage for ${pair.symbols}, net profit: ${netProfit}`);
      try {
        // lock to prevent tx nonce overlap
        await lock.acquire('flash-bot', async () => {
          const response = await flashBot.flashArbitrage(pair0, pair1, {
            gasPrice: config.gasPrice,
            gasLimit: config.gasLimit,
          });
          const receipt = await response.wait(1);
          log.info(`Tx: ${receipt.transactionHash}`);
        });
      } catch (err) {
        if (err.message === 'Too much pending tasks' || err.message === 'async-lock timed out') {
          return;
        }
        log.error(err);
      }
    }
  };
}

let pairs: any;

async function main() {
  const net = Network.MATIC
  pairs = await tryLoadPairs(net);
  const flashBot = (await ethers.getContractAt('FlashBot', config.contractAddr)) as FlashBot;
  const [baseTokens] = getTokens(net);

  log.info('Start arbitraging');
  while (true) {
    await pool({
      collection: pairs,
      task: arbitrageFunc(flashBot, baseTokens),
      maxConcurrency: config.concurrency,
    });
    await sleep(1000);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('MAIN:', err);
    throw err;
    process.exit(1);
  });
