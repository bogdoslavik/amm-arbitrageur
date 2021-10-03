import { ethers } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';
import deployer from './../.secret';

async function main(token: string) {
  const [signer] = await ethers.getSigners();
  const flashBot: FlashBot = (await ethers.getContractAt(
    'FlashBot',
    deployer.bot, // your contract address
    signer
  )) as FlashBot;

  token = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  console.log('token', token);
  const result = await flashBot.addBaseToken(token);
  console.log('tx hash', result.hash);
  console.log(`Base token added: ${token}`);
}

const args = process.argv.slice(2);

main(args[0])
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
