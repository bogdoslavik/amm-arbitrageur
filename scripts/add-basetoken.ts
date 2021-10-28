//run cmd: hardhat run --network matic scripts/add-basetoken.ts
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

  const tokens = await flashBot.getBaseTokens();
  console.log('base tokens before', tokens);

  token = ''; // TODO PUT NEW BASE TOKEN ADDRESS HERE
  console.log('token', token);
  if (!token) {
    console.log('error: token address is not specified');
    return;
  }
  const result = await flashBot.addBaseToken(token);
  // const result = await flashBot.removeBaseToken(token);
  console.log('tx hash:', result.hash);
  console.log(`Base token added: ${token}`);
  const tokensAfter = await flashBot.getBaseTokens();
  console.log('base tokens after', tokensAfter);
}

const args = process.argv.slice(2);

main(args[0])
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
