import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';
import { IWETH } from '../typechain/IWETH';
import * as addressbook from '../addressbook';

const adr = addressbook.matic; //TODO set by network name

describe('Flashswap', () => {
  let weth: IWETH;
  let flashBot: FlashBot;

  const Base = adr.TestBase;
  const Quote = adr.TestQuote;

  beforeEach(async () => {
    const wethFactory = (await ethers.getContractAt('IWETH', Base)) as IWETH;
    weth = wethFactory.attach(Base) as IWETH;

    const fbFactory = await ethers.getContractFactory('FlashBot');
    flashBot = (await fbFactory.deploy(Base)) as FlashBot;
  });

  describe('flash swap arbitrage', () => {
    let signer: SignerWithAddress;

    const uniFactoryAbi = ['function getPair(address, address) view returns (address pair)'];
    const uniPairAbi = ['function sync()'];

    const dex1FactoryAddr = adr.dex1FactoryAddr;
    const dex1Factory = new ethers.Contract(dex1FactoryAddr, uniFactoryAbi, waffle.provider);
    let dex1PairAddr: any;
    let dex1Pair: Contract;

    const dex2FactoryAddr = adr.dex2FactoryAddr;
    const dex2Factory = new ethers.Contract(dex2FactoryAddr, uniFactoryAbi, waffle.provider);
    let dex2PairAddr: any;

    before(async () => {
      [signer] = await ethers.getSigners();
      dex1PairAddr = await dex1Factory.getPair(Base, Quote);
      dex1Pair = new ethers.Contract(dex1PairAddr, uniPairAbi, waffle.provider);
      dex2PairAddr = await dex2Factory.getPair(Base, Quote);
    });

    it('do flash swap between Dex2 and Dex1', async () => {
      // transfer 100000 to mdex pair
      const amountEth = ethers.utils.parseEther('100000');
      await weth.deposit({ value: amountEth });
      await weth.transfer(dex1PairAddr, amountEth);
      await dex1Pair.connect(signer).sync();

      const balanceBefore = await ethers.provider.getBalance(flashBot.address);
      await flashBot.flashArbitrage(dex1PairAddr, dex2PairAddr);
      const balanceAfter = await ethers.provider.getBalance(flashBot.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it('calculate how much profit we get', async () => {
      // transfer 100000 to MDEX pair
      const amountEth = ethers.utils.parseEther('100000');
      await weth.deposit({ value: amountEth });
      await weth.transfer(dex1PairAddr, amountEth);
      await dex1Pair.connect(signer).sync();

      const res = await flashBot.getProfit(dex1PairAddr, dex2PairAddr);
      expect(res.profit).to.be.gt(ethers.utils.parseEther('500'));
      expect(res.baseToken).to.be.eq(Base);
    });

    it('revert if callback is called from address without permission', async () => {
      await expect(
        flashBot.uniswapV2Call(flashBot.address, ethers.utils.parseEther('1000'), 0, '0xabcd')
      ).to.be.revertedWith('Non permissioned address call');
    });
  });
});
