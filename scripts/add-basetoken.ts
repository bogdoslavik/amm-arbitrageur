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

  //token = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
  console.log('token', token);
  if (!token) {
    console.log('error: token address is not specified');
    return;
  }
  const result = await flashBot.addBaseToken(token);
  console.log('tx hash:', result.hash);
  console.log(`Base token added: ${token}`);
}

const args = process.argv.slice(2);

main(args[0])
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
