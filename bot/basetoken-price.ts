import axios from 'axios';
import AsyncLock from 'async-lock';

import config from './config';
import log from './log';

const lock = new AsyncLock();

let bnbPrice = 0;

// clear bnb price every hour
setInterval(() => {
  lock
    .acquire('bnb-price', () => {
      bnbPrice = 0;
      return;
    })
    .then(() => {});
}, 3600000);

export async function getBnbPrice(): Promise<number> {
  return await lock.acquire('bnb-price', async () => {
    if (bnbPrice !== 0) {
      return bnbPrice;
    }
    const res = await axios.get(config.bscScanUrl);
    // console.log('res.data', res.data);
    bnbPrice = parseFloat(res.data.result.maticusd); //TODO net
    log.info(`MATIC price: $${bnbPrice}`);
    return bnbPrice;
  });
}
