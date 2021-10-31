const bsc: {[index: string]:any} = {
  WBNB     : '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  TestBase : '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  TestQuote: '0x55d398326f99059ff775485246999027b3197955', // USDT

  dex1FactoryAddr: '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8', //mdexFactoryAddr
  dex2FactoryAddr: '0xBCfCcbde45cE874adCB698cC183deBcF17952812', //pancakeFactoryAddr
}

const matic: {[index: string]:any} = {
  TestBase : '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
  TestQuote: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH

  dex1FactoryAddr: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', //SushiSwap
  dex2FactoryAddr: '0x684d8c187be836171a1af8d533e4724893031828', //TetuSwap

  SushiSwap: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  QuickSwap: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
  WaultSwap: '0xa98ea6356A316b44Bf710D5f9b6b4eA0081409Ef',
  CurveSwap: '0x094d12e5b541784701fd8d65f11fc0598fbc6332',

  WETH  : '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  USDC  : '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  DAI   : '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  USDT  : '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  WBTC  : '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
}

export { bsc, matic };
