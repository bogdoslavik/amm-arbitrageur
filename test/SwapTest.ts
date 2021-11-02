import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, waffle, network } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';
import { IWETH } from '../typechain/IWETH';
import { IERC20 } from '../typechain/IERC20';
import * as addressbook from '../addressbook';

const adr = addressbook.matic; //TODO set by network name

describe('Flashswap', () => {
  let weth: IWETH;
  let baseERC20: IERC20;
  let flashBot: FlashBot;

  // const Base = adr.TestBase;
  // const Quote = adr.TestQuote;
  const Base = adr.TestBaseUSDC;
  const Quote = adr.TestQuoteTETU;

  beforeEach(async () => {
    const wethFactory = (await ethers.getContractAt('IWETH', Base)) as IWETH;
    const erc20Factory = (await ethers.getContractAt('IERC20', Base)) as IERC20;
    weth = wethFactory.attach(Base) as IWETH;
    baseERC20 = erc20Factory.attach(Base) as IERC20;

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

    it.only('do swap between Dex2 and Dex1 (TETU/USDC)', async () => {
      const USDCHolder = "0x49f5ab0cF42c24E83F653625e19F6b897B766c3A"

      // console.log('send Ether to USDCHolder');
      // await signer.sendTransaction({
      //   to: USDCHolder,
      //   value: ethers.utils.parseEther("100")
      // });

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [USDCHolder], // USDC holder
      });
      const signerUSDC = await ethers.getSigner(USDCHolder);

      // top up USDC bot balance
      console.log('top up USDC bot balance');
      const botAmount = 200*(10**6);
      await baseERC20.connect(signerUSDC).approve(USDCHolder, botAmount);
      await baseERC20.connect(signerUSDC).transferFrom(USDCHolder, flashBot.address, botAmount);

      // transfer 100000 to mdex pair
      // console.log('transfer 100000 to mdex pair')
      const dexAmount = 200*(10**6);
      await baseERC20.connect(signerUSDC).approve(USDCHolder, dexAmount);
      await baseERC20.connect(signerUSDC).transferFrom(USDCHolder, dex1PairAddr, dexAmount);

      await dex1Pair.connect(signer).sync();

      const balanceBefore = await baseERC20.balanceOf(signer.address);
      await flashBot.flashArbitrage(dex1PairAddr, dex2PairAddr);
      const balanceAfter = await baseERC20.balanceOf(signer.address);
      const profit = balanceAfter.sub(balanceBefore);
      console.log('profit', profit.toString());

      expect(balanceAfter).to.be.gt(balanceBefore);
    })

    it('do swap between Dex2 and Dex1 (WETH/WMATIC)', async () => {

      // transfer 100000 to mdex pair
      const amountEth = ethers.utils.parseEther('100000');
      await weth.deposit({ value: amountEth });
      await weth.transfer(dex1PairAddr, amountEth);
      // top up WETH (WMATIC) bot balance
      const botEth = ethers.utils.parseEther('1000');
      await weth.deposit({ value: botEth });
      await weth.transfer(flashBot.address, botEth);

      await dex1Pair.connect(signer).sync();

      const balanceBefore = await baseERC20.balanceOf(signer.address);
      await flashBot.flashArbitrage(dex1PairAddr, dex2PairAddr);
      const balanceAfter = await baseERC20.balanceOf(signer.address);
      const profit = balanceAfter.sub(balanceBefore);
      console.log('profit', profit.toString());

      expect(balanceAfter).to.be.gt(balanceBefore);
    })

 /*   it('do flash swap between Dex2 and Dex1', async () => {
      // transfer 100000 to mdex pair
      const amountEth = ethers.utils.parseEther('100000');
      await weth.deposit({ value: amountEth });
      await weth.transfer(dex1PairAddr, amountEth);

      await dex1Pair.connect(signer).sync();

      const balanceBefore = await ethers.provider.getBalance(flashBot.address);
      await flashBot.flashArbitrage(dex1PairAddr, dex2PairAddr);
      const balanceAfter = await ethers.provider.getBalance(flashBot.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });*/

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
