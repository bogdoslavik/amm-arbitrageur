import { ethers, run } from 'hardhat';
import * as addressbook from '../addressbook';

import deployer from '../.secret';

// WBNB address on BSC, WETH address on ETH
const WethAddr = addressbook.matic.WMATIC;
console.log('WethAddr', WethAddr);

async function main() {
  await run('compile');
  const FlashBot = await ethers.getContractFactory('FlashBot');
  const flashBot = await FlashBot.deploy(WethAddr);

  console.log(`FlashBot deployed to ${flashBot.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
