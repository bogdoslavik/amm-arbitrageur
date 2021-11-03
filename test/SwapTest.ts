import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, waffle, network } from 'hardhat';
import { FlashBot, IWETH, IERC20, ERC20 } from '../typechain';
import * as addressbook from '../addressbook';
import { BigNumber } from 'ethers';

const adr = addressbook.matic; //TODO set by network name

describe.only('Arbitrage', () => {
  let weth: IWETH;
  let baseIERC20: IERC20;
  let baseERC20: ERC20;
  let flashBot: FlashBot;


  beforeEach(async () => {
    const fbFactory = await ethers.getContractFactory('FlashBot');
    flashBot = (await fbFactory.deploy(
      adr.WMATIC, [adr.USDC, adr.USDT])) as FlashBot;

  });

  async function testPair(Base: string, Quote: string) {
    const wethFactory = (await ethers.getContractAt('IWETH', Base)) as IWETH;
    const ierc20Factory = (await ethers.getContractAt('IERC20', Base)) as IERC20;
    const erc20Factory = (await ethers.getContractAt('ERC20', Base)) as ERC20;
    weth = wethFactory.attach(Base) as IWETH;
    baseIERC20 = ierc20Factory.attach(Base) as IERC20;
    baseERC20 = erc20Factory.attach(Base) as ERC20;

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

    [signer] = await ethers.getSigners();
    dex1PairAddr = await dex1Factory.getPair(Base, Quote);
    dex1Pair = new ethers.Contract(dex1PairAddr, uniPairAbi, waffle.provider);
    dex2PairAddr = await dex2Factory.getPair(Base, Quote);


    // console.log('send Ether to USDCHolder');
    // await signer.sendTransaction({
    //   to: USDCHolder,
    //   value: ethers.utils.parseEther("100")
    // });

    const Holder = adr.holders[Base];

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [Holder], // base token holder
    });
    const signerUSDC = await ethers.getSigner(Holder);
    const baseDecimals = await baseERC20.decimals();
    console.log('baseDecimals', baseDecimals);
    const one = BigNumber.from(10).pow(baseDecimals)

    // top up USDC bot balance
    console.log('top up bot balance');
    const botAmount = BigNumber.from(200).mul(one);
    await baseIERC20.connect(signerUSDC).approve(Holder, botAmount);
    await baseIERC20.connect(signerUSDC).transferFrom(Holder, flashBot.address, botAmount);

    // transfer 100000 to mdex pair
    console.log('transfer 1000000 to mdex pair')
    const dexAmount = BigNumber.from(100000).mul(one);
    await baseIERC20.connect(signerUSDC).approve(Holder, dexAmount);
    await baseIERC20.connect(signerUSDC).transferFrom(Holder, dex1PairAddr, dexAmount);
    await dex1Pair.connect(signer).sync();

    // getProfit
    const estimatedProfit1= await flashBot.getProfit(dex1PairAddr, dex2PairAddr);
    console.log('estimatedProfit1', estimatedProfit1.toString());
    // const estimatedProfit2 = await flashBot.getProfit(dex2PairAddr, dex1PairAddr);
    // console.log('estimatedProfit2', estimatedProfit2.toString());

    // Arbitrage
    const balanceBefore = await baseIERC20.balanceOf(signer.address);
    await flashBot.flashArbitrage(dex2PairAddr, dex1PairAddr);
    const balanceAfter = await baseIERC20.balanceOf(signer.address);
    const profit = balanceAfter.sub(balanceBefore);
    console.log('profit', profit.toString())
    console.log('      ', profit.div(one).toString());

    expect(balanceAfter).to.be.gt(balanceBefore);
  }

  describe('Normal swap arbitrage', () => {

    const pairs:any = {
      USDC_TETU  : {b:adr.USDC,   q:adr.TETU},
      USDT_TETU  : {b:adr.USDT,   q:adr.TETU},
      WMATIC_TETU: {b:adr.WMATIC, q:adr.TETU},

      USDC_WETH  : {b:adr.USDC,   q:adr.WETH},
      USDT_WETH  : {b:adr.USDT,   q:adr.WETH},
      WMATIC_WETH: {b:adr.WMATIC, q:adr.WETH},

      USDC_WBTC  : {b:adr.USDC,   q:adr.WBTC},
      USDT_WBTC  : {b:adr.USDT,   q:adr.WBTC},
      WMATIC_WBTC: {b:adr.WMATIC, q:adr.WBTC},
    }

    async function testPairFromArray(pair: any) {
      await testPair(pair.b, pair.q);
    }
    for (const key in pairs) {
      console.log('do arbitrage key', key);
      it(`do arbitrage ${key}`, async () => {
        await testPairFromArray(pairs[key]);
      })
    }

 /*   it('do swap between Dex2 and Dex1 (WETH/WMATIC)', async () => {

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
    })*/

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

  /*  it('calculate how much profit we get', async () => {
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
    });*/
  });
});
