const bsc: {[index: string]:any} = {
  WBNB     : '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  TestBase : '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  TestQuote: '0x55d398326f99059ff775485246999027b3197955', // USDT

  dex1FactoryAddr: '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8', //mdexFactoryAddr
  dex2FactoryAddr: '0xBCfCcbde45cE874adCB698cC183deBcF17952812', //pancakeFactoryAddr
}

  const TETU  = '0x255707B70BF90aa112006E1b07B9AeA6De021424'
  const WETH  = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
  const WMATIC= '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
  const USDC  = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
  const DAI   = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
  const USDT  = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
  const WBTC  = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'

  const TetuSwap  = '0x684d8c187be836171a1af8d533e4724893031828';
  const SushiSwap = '0xc35DADB65012eC5796536bD9864eD8773aBc74C4';
  const QuickSwap = '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32';
  const WaultSwap = '0xa98ea6356A316b44Bf710D5f9b6b4eA0081409Ef';
  const CurveSwap = '0x094d12e5b541784701fd8d65f11fc0598fbc6332';

const matic: {[index: string]:any} = {

  dex1FactoryAddr: QuickSwap,
  dex2FactoryAddr: TetuSwap,


  TETU, WETH, WMATIC, USDC, DAI, USDT, WBTC,
  holders: {}
}
matic.holders[WMATIC] = '0xFffbCD322cEace527C8ec6Da8de2461C6D9d4e6e'
matic.holders[USDC]   = '0x49f5ab0cF42c24E83F653625e19F6b897B766c3A'
matic.holders[USDT]   = '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe'

export { bsc, matic };
