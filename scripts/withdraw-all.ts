import { ethers, run } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';
import deployer from './../.secret';

async function main() {
  await run('compile');
  const flashBot: FlashBot = (await ethers.getContractAt(
    'FlashBot',
    deployer.bot // contract address
  )) as FlashBot;

  const result = await flashBot.withdrawAll();
  console.log('flashBot.withdrawAll() executed', result);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
