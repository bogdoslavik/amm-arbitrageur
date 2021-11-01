// noinspection SpellCheckingInspection

import fs from 'fs';
import path from 'path';
import 'lodash.combinations';
import lodash from 'lodash';
import { Contract } from '@ethersproject/contracts';
import { ethers } from 'hardhat';

import log from './log';

export enum Network {
  BSC = 'bsc',
  MATIC = 'matic',
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// !!! Factory addresses
const maticDexes: AmmFactories = {
  tetu : '0x684d8c187be836171a1Af8D533e4724893031828',
  sushi: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  // quick: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
  // wault: '0xa98ea6356A316b44Bf710D5f9b6b4eA0081409Ef',
};

const maticBaseTokens: Tokens = {
  /*
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  USDT  : '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  USDC  : '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  DAI   : '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',

   */

  wmatic: { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' }, //+
  // usdt:   { symbol: 'USDT',   address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' }, //+
  // usdc:   { symbol: 'USDC',   address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' }, //+
  // tetu:   { symbol: 'TETU',   address: '0x255707B70BF90aa112006E1b07B9AeA6De021424' }, //+
  // weth:   { symbol: 'WETH',   address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' },
  // wbtc:   { symbol: 'WBTC',   address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6' },
  // dai:    { symbol: 'DAI',    address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' },
};

const maticQuoteTokens: Tokens = {
  //  0 usdc-usdt
  //  1 TLP_TETU_USDC
  //  2 TLP_USDC_WETH
  //  3 TLP_WBTC_WETH
  //  4 TLP_WETH_USDT
  //  5 TLP_WBTC_USDC
  //  6 TLP_WBTC_USDT
  //  7 TLP_WBTC_TETU
  //  8 TLP_TETU_USDT
  //  9 TLP_TETU_WETH
  // 10 TLP_WMATIC_WETH
  // 11 TLP_WMATIC_USDC
  // 12 TLP_WMATIC_WBTC
  // 13 TLP_WMATIC_USDT
  // 14 TLP_WMATIC_TETU

  tetu:   { symbol: 'TETU',   address: '0x255707B70BF90aa112006E1b07B9AeA6De021424' },
  // wmatic: { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' },
  // usdt:   { symbol: 'USDT',   address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  // usdc:   { symbol: 'USDC',   address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
  weth:   { symbol: 'WETH',   address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' },
  wbtc:   { symbol: 'WBTC',   address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6' },

 /* AMAAVE: { symbol: 'AMAAVE', address: '0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360' },
  AMDAI: { symbol: 'AMDAI', address: '0x27f8d03b3a2196956ed754badc28d73be8830a6e' },
  AMUSDT: { symbol: 'AMUSDT', address: '0x60d55f02a771d515e077c9c2403a1ef324885cec' },
  AMWBTC: { symbol: 'AMWBTC', address: '0x5c2ed810328349100a66b82b78a1791b101c9d61' },
  AMWETH: { symbol: 'AMWETH', address: '0x28424507fefb6f7f8e9d3860f56504e4e5f5f390' },
  AMUSDC: { symbol: 'AMUSDC', address: '0x1a13f4ca1d028320a707d99520abfefca3998b7f' },
  BAMBOO: { symbol: 'BAMBOO', address: '0x8095d18fb1e702d69402a6a8c7a56bc1cce6ecc2' },
  POLYMOON: { symbol: 'POLYMOON', address: '0xefb3009ddac87e8144803d78e235e7fb4cd36e61' },
  POLYFI: { symbol: 'POLYFI', address: '0xfb005a1834eaaa6e55945b4b756e6873cecfe5ae' },
  MYFRIENDS: { symbol: 'MYFRIENDS', address: '0xa509da749745ac07e9ae47e7a092ead2648b47f2' },
  MALT: { symbol: 'MALT', address: '0x1c40ac03aacaf5f85808674e526e9c26309db92f' },
  LITHIUM: { symbol: 'LITHIUM', address: '0xfe1a200637464fbc9b60bc7aecb9b86c0e1d486e' },
  $50K: { symbol: '50K', address: '0xa656dc2b1061f80f4e847bba2d9bd52db4889836' },
  BULL: { symbol: 'BULL', address: '0x138b9c072879219cd6ef2d6d9e0d179b3396f07b' },
  $50C: { symbol: '50C', address: '0x0102bbfddffbd8d28d3a1b9c47017f62f42768f2' },
  YORK: { symbol: 'YORK', address: '0x21de43d96cfddd203da3352545e0054534776652' },
  DOJO: { symbol: 'DOJO', address: '0xca9e4a7617d5fdaaa49beb8dc8e506706324e253' },
  SHARK: { symbol: 'SHARK', address: '0xd201b8511aab3e9b094b35abcd5d7863c78d6d0e' },
  AMWMATIC: { symbol: 'AMWMATIC', address: '0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4' },
  CHUM: { symbol: 'CHUM', address: '0x2e2dde47952b9c7defde7424d00dd2341ad927ca' },
  POLYGOLD: { symbol: 'POLYGOLD', address: '0x0184316f58b9a44acdd3e683257259dc0cf2202a' },
  YIELD: { symbol: 'YIELD', address: '0xce4e6da9c509cb33c23d748713c681c959f68658' },
  ACAR: { symbol: 'ACAR', address: '0xcbce9f77921c2e90522d438df4c5582f4c617768' },
  AGAC: { symbol: 'AGAC', address: '0x669ddc70273084ea30e6cd4f28ca6e2c70735065' },
  PCAKE: { symbol: 'PCAKE', address: '0xd9a2c5c0fb2f138c2b96582d29a648df70f80465' },
  YCORN: { symbol: 'YCORN', address: '0x98b1d7ba836a0a73d741735a309a18febeb6299c' },
  VERT: { symbol: 'VERT', address: '0x72572ccf5208b59f4bcc14e6653d8c31cd1fc5a0' },
  SWAN: { symbol: 'SWAN', address: '0xab7589de4c581db0fb265e25a8e7809d84ccd7e8' },
  RVRS: { symbol: 'RVRS', address: '0x5dd175a4242afe19e5c1051d8cd13fc8979f2329' },
  LION: { symbol: 'LION', address: '0x1da554d34027ca8de74c5b1cd2fa53a8a1492c94' },
  AURORA: { symbol: 'AURORA', address: '0x0c8c8ae8bc3a69dc8482c01ceacfb588bb516b01' },
  WAVE: { symbol: 'WAVE', address: '0x4de7fea447b837d7e77848a4b6c0662a64a84e14' },
  SRAT: { symbol: 'SRAT', address: '0x1132f58810ee9ff13e97aeccd8dda688cc5eb8f4' },
  CRYSTL: { symbol: 'CRYSTL', address: '0x76bf0c28e604cc3fe9967c83b3c3f31c213cfe64' },
  FIRE: { symbol: 'FIRE', address: '0xe118e8b6dc166cd83695825eb1d30e792435bb00' },
  SONG: { symbol: 'SONG', address: '0x609255414ff5289f87c99baf9737a4ec85a18643' },
  MOON: { symbol: 'MOON', address: '0xc56d17dd519e5eb43a19c9759b5d5372115220bd' },
  POLYBABYDOGE: { symbol: 'POLYBABYDOGE', address: '0xdf2140dee6b07ae495382bc1cd446f7b328f63e3' },
  BONE: { symbol: 'BONE', address: '0x80244c2441779361f35803b8c711c6c8fc6054a3' },
  PZAP: { symbol: 'PZAP', address: '0xeb2778f74e5ee038e67aa6c77f0f0451abd748fd' },
  XDO: { symbol: 'XDO', address: '0x3dc7b06dd0b1f08ef9acbbd2564f8605b4868eea' },
  SGAJ: { symbol: 'SGAJ', address: '0x94c7d657f1c8be06a4dc009d2d475bb559d858cb' },
  PGOV: { symbol: 'PGOV', address: '0xd5d84e75f48e75f01fb2eb6dfd8ea148ee3d0feb' },
  HONOR: { symbol: 'HONOR', address: '0xb82a20b4522680951f11c94c54b8800c1c237693' },
  MATPAD: { symbol: 'MATPAD', address: '0x3bfce6d6f0d3d3f1326d86abdbe2845b4740dc2e' },
  DMAGIC: { symbol: 'DMAGIC', address: '0x61daecab65ee2a1d5b6032df030f3faa3d116aa7' },
  PSWAMP: { symbol: 'PSWAMP', address: '0x5f1657896b38c4761dbc5484473c7a7c845910b6' },
  YAMP: { symbol: 'YAMP', address: '0x87f654c4b347230c60cad8d7ea9cf0d7238bcc79' },
  SDO: { symbol: 'SDO', address: '0x66c59dded4ef01a3412a8b019b6e41d4a8c49a35' },
  ARTH: { symbol: 'ARTH', address: '0xe52509181feb30eb4979e29ec70d50fd5c44d590' },
  ROLL: { symbol: 'ROLL', address: '0xc68e83a305b0fad69e264a1769a0a070f190d2d6' },
  EGG: { symbol: 'EGG', address: '0x245e5ddb65efea6522fa913229df1f4957fb2e21' },
  POLR: { symbol: 'POLR', address: '0x029c2bf9e5e7bf11328f045205308244e11efc46' },
  GBTS: { symbol: 'GBTS', address: '0xbe9512e2754cb938dd69bbb96c8a09cb28a02d6d' },
  BONE2: { symbol: 'BONE2', address: '0x6bb45ceac714c52342ef73ec663479da35934bf7' },
  PYQ: { symbol: 'PYQ', address: '0x5a3064cbdccf428ae907796cf6ad5a664cd7f3d8' },
  PUP: { symbol: 'PUP', address: '0xcfe2cf35d2bdde84967e67d00ad74237e234ce59' },
  MOCA: { symbol: 'MOCA', address: '0xce899f26928a2b21c6a2fddd393ef37c61dba918' },
  BALL: { symbol: 'BALL', address: '0x883abe4168705d2e5da925d28538b7a6aa9d8419' },
  PUSD: { symbol: 'PUSD', address: '0x9af3b7dc29d3c4b1a5731408b6a9656fa7ac3b72' },
  FISH: { symbol: 'FISH', address: '0x3a3df212b7aa91aa0402b9035b098891d276572b' },
  MEEB: { symbol: 'MEEB', address: '0x64afdf9e28946419e325d801fb3053d8b8ffdc23' },
  SDS: { symbol: 'SDS', address: '0xab72ee159ff70b64beecbbb0fbbe58b372391c54' },
  UBQ: { symbol: 'UBQ', address: '0xb1c5c9b97b35592777091cd34ffff141ae866abd' },
  OMEN: { symbol: 'OMEN', address: '0x76e63a3e7ba1e2e61d3da86a87479f983de89a7e' },
  XUSD: { symbol: 'XUSD', address: '0x3a3e7650f8b9f667da98f236010fbf44ee4b2975' },
  ANGEL: { symbol: 'ANGEL', address: '0x0b6afe834dab840335f87d99b45c2a4bd81a93c7' },
  GFI: { symbol: 'GFI', address: '0x874e178a2f3f3f9d34db862453cd756e7eab0381' },
  WHIRL: { symbol: 'WHIRL', address: '0xfc5a11d0fe8b5ad23b8a643df5eae60b979ce1bf' },
  POLYDOGE: { symbol: 'POLYDOGE', address: '0x8a953cfe442c5e8855cc6c61b1293fa648bae472' },
  WEXPOLY: { symbol: 'WEXPOLY', address: '0x4c4bf319237d98a30a929a96112effa8da3510eb' },
  SPADE: { symbol: 'SPADE', address: '0xf5ea626334037a2cf0155d49ea6462fddc6eff19' },
  QI: { symbol: 'QI', address: '0x580a84c73811e1839f75d86d75d88cca0c241ff4' },
  BAN: { symbol: 'BAN', address: '0xe20b9e246db5a0d21bf9209e4858bc9a3ff7a034' },
  PEAR: { symbol: 'PEAR', address: '0xc8bcb58caef1be972c0b638b1dd8b0748fdc8a44' },
  ICE: { symbol: 'ICE', address: '0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef' },
  MOONED: { symbol: 'MOONED', address: '0x7e4c577ca35913af564ee2a24d882a4946ec492b' },
  KOGECOIN: { symbol: 'KOGECOIN', address: '0x13748d548d95d78a3c83fe3f32604b4796cffa23' },
  KOM: { symbol: 'KOM', address: '0xc004e2318722ea2b15499d6375905d75ee5390b8' },
  POLYBUNNY: { symbol: 'POLYBUNNY', address: '0x4c16f69302ccb511c5fac682c7626b9ef0dc126a' },
  MIMATIC: { symbol: 'MIMATIC', address: '0xa3fa99a148fa48d14ed51d610c367c61876997f1' },
  DINO: { symbol: 'DINO', address: '0xaa9654becca45b5bdfa5ac646c939c62b527d394' },
  // XXXX: { symbol: 'XXXX', address: '0x0000000000000000000000000000000000000000' },
*/
};


const bscBaseTokens: Tokens = {
  wbnb: { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
  usdt: { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955' },
  busd: { symbol: 'BUSD', address: '0xe9e7cea3dedca5984780bafc599bd69add087d56' },
};

const bscQuoteTokens: Tokens = {
  eth: { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' },
  btcb: { symbol: 'BTCB', address: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c' },
  cake: { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' },
  bake: { symbol: 'BAKE', address: '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5' },
  alpaca: { symbol: 'ALPACA', address: '0x8f0528ce5ef7b51152a59745befdd91d97091d2f' },
  band: { symbol: 'BAND', address: '0xad6caeb32cd2c308980a548bd0bc5aa4306c6c18' },
  bbadger: { symbol: 'bBADGER', address: '0x1f7216fdb338247512ec99715587bb97bbf96eae' },
  beth: { symbol: 'BETH', address: '0x250632378E573c6Be1AC2f97Fcdf00515d0Aa91B' },
  cream: { symbol: 'CREAM', address: '0xd4cb328a82bdf5f03eb737f37fa6b370aef3e888' },
  dot: { symbol: 'DOT', address: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402' },
  doge: { symbol: 'DOGE', address: '0x4206931337dc273a630d328dA6441786BfaD668f' },
  mdx: { symbol: 'MDX', address: '0x9c65ab58d8d978db963e63f2bfb7121627e3a739' },
  inj: { symbol: 'INJ', address: '0xa2b726b1145a4773f68593cf171187d8ebe4d495' },
  beefy: { symbol: 'BEFI', address: '0xCa3F508B8e4Dd382eE878A314789373D80A5190A' },
  atm: { symbol: 'ATM', address: '0x25e9d05365c867e59c1904e7463af9f312296f9e' },
  badpad: { symbol: 'BSCPAD', address: '0x5a3010d4d8d3b5fb49f8b6e57fb9e48063f16700' },
  bunny: { symbol: 'BUNNY', address: '0xc9849e6fdb743d08faee3e34dd2d1bc69ea11a51' },
  eps: { symbol: 'EPS', address: '0xa7f552078dcc247c2684336020c03648500c6d9f' },
  iron: { symbol: 'IRON', address: '0x7b65b489fe53fce1f6548db886c08ad73111ddd8' },
  lina: { symbol: 'LINA', address: '0x762539b45a1dcce3d36d080f74d1aed37844b878' },
  alpha: { symbol: 'ALPHA', address: '0xa1faa113cbE53436Df28FF0aEe54275c13B40975' },
  venus: { symbol: 'XVS', address: '0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63' },
  twt: { symbol: 'TWT', address: '0x4B0F1812e5Df2A09796481Ff14017e6005508003' },
  link: { symbol: 'LINK', address: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD' },
  vai: { symbol: 'VAI', address: '0x4bd17003473389a42daf6a0a729f6fdb328bbbd7' },
  nerve: { symbol: 'NRV', address: '0x42f6f551ae042cbe50c739158b4f0cac0edb9096' },
  btcst: { symbol: 'BTCST', address: '0x78650b139471520656b9e7aa7a5e9276814a38e9' },
  auto: { symbol: 'AUTO', address: '0xa184088a740c695e156f91f5cc086a06bb78b827' },
  kickpad: { symbol: 'KICKPAD', address: '0xcfefa64b0ddd611b125157c41cd3827f2e8e8615' },
  oction: { symbol: 'OCTI', address: '0x6c1de9907263f0c12261d88b65ca18f31163f29d' },
  oneinch: { symbol: '1INCH', address: '0x111111111117dc0aa78b770fa6a738034120c302' },
  vancat: { symbol: 'VANCAT', address: '0x8597ba143ac509189e89aab3ba28d661a5dd9830' },
  sfp: { symbol: 'SFP', address: '0xd41fdb03ba84762dd66a0af1a6c8540ff1ba5dfb' },
  sparta: { symbol: 'SPARTA', address: '0xe4ae305ebe1abe663f261bc00534067c80ad677c' },
  tcake: { symbol: 'TCAKE', address: '0x3b831d36ed418e893f42d46ff308c326c239429f' },
  fairmoon: { symbol: 'FAIRMOON', address: '0xfe75cd11e283813ec44b4592476109ba3706cef6' },
  orakuru: { symbol: 'ORK', address: '0xced0ce92f4bdc3c2201e255faf12f05cf8206da8' },
  bgov: { symbol: 'BGOV', address: '0xf8e026dc4c0860771f691ecffbbdfe2fa51c77cf' },
  frontier: { symbol: 'FRONT', address: '0x928e55dab735aa8260af3cedada18b5f70c72f1b' },
  swampy: { symbol: 'SWAMP', address: '0xc5a49b4cbe004b6fd55b30ba1de6ac360ff9765d' },
  ele: { symbol: 'ELE', address: '0xacd7b3d9c10e97d0efa418903c0c7669e702e4c0' },
  bondly: { symbol: 'BONDLY', address: '0x96058f8c3e16576d9bd68766f3836d9a33158f89' },
  ramp: { symbol: 'RAMP', address: '0x8519ea49c997f50ceffa444d240fb655e89248aa' },
  googse: { symbol: 'EGG', address: '0xf952fc3ca7325cc27d15885d37117676d25bfda6' },
  aioz: { symbol: 'AIOZ', address: '0x33d08d8c7a168333a85285a68c0042b39fc3741d' },
  starter: { symbol: 'START', address: '0x31d0a7ada4d4c131eb612db48861211f63e57610' },
  dshare: { symbol: 'SBDO', address: '0x0d9319565be7f53cefe84ad201be3f40feae2740' },
  bdollar: { symbol: 'BDO', address: '0x190b589cf9fb8ddeabbfeae36a813ffb2a702454' },
  swipe: { symbol: 'SXP', address: '0x47bead2563dcbf3bf2c9407fea4dc236faba485a' },
  tornado: { symbol: 'TORN', address: '0x40318becc7106364D6C41981956423a7058b7455' },
  uni: { symbol: 'UNI', address: '0xbf5140a22578168fd562dccf235e5d43a02ce9b1' },
  lit: { symbol: 'LIT', address: '0xb59490aB09A0f526Cc7305822aC65f2Ab12f9723' },
  alice: { symbol: 'ALICE', address: '0xac51066d7bec65dc4589368da368b212745d63e8' },
  reef: { symbol: 'REEF', address: '0xf21768ccbc73ea5b6fd3c687208a7c2def2d966e' },
  pet: { symbol: 'PET', address: '0x4d4e595d643dc61ea7fcbf12e4b1aaa39f9975b8' },
};

const bscDexes: AmmFactories = {
  pancake: '0xBCfCcbde45cE874adCB698cC183deBcF17952812',
  mdex: '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8',
  bakery: '0x01bF7C66c6BD861915CdaaE475042d3c4BaE16A7',
  julswap: '0x553990F2CBA90272390f62C5BDb1681fFc899675',
   apeswap: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
  // value: '0x1B8E12F839BD4e73A47adDF76cF7F0097d74c14C',
};

function getFactories(network: Network): AmmFactories {
  switch (network) {
    case Network.BSC:
      return bscDexes;
    case Network.MATIC:
      return maticDexes;
    default:
      throw new Error(`Unsupported network:${network}`);
  }
}

export function getTokens(network: Network): [Tokens, Tokens] {
  switch (network) {
    case Network.BSC:
      return [bscBaseTokens, bscQuoteTokens];
    case Network.MATIC:
      return [maticBaseTokens, maticQuoteTokens];
    default:
      throw new Error(`Unsupported network:${network}`);
  }
}

async function updatePairs(network: Network): Promise<ArbitragePair[]> {
  log.info('Updating arbitrage token pairs');
  const [baseTokens, quoteTokens] = getTokens(network);
  const factoryAddrs = getFactories(network);

  const factoryAbi = ['function getPair(address, address) view returns (address pair)'];
  let factories: Contract[] = [];

  log.info(`Fetch from dexes: ${Object.keys(factoryAddrs)}`);
  for (const key in factoryAddrs) {
    const addr = factoryAddrs[key];
    const factory = new ethers.Contract(addr, factoryAbi, ethers.provider);
    factories.push(factory);
  }

  let tokenPairs: TokenPair[] = [];
  for (const key in baseTokens) {
    const baseToken = baseTokens[key];
    for (const quoteKey in quoteTokens) {
      const quoteToken = quoteTokens[quoteKey];
      let tokenPair: TokenPair = { symbols: `${quoteToken.symbol}-${baseToken.symbol}`, pairs: [] };
      for (const factory of factories) {
        const pair = await factory.getPair(baseToken.address, quoteToken.address);
        if (pair != ZERO_ADDRESS) {
          tokenPair.pairs.push(pair);
        }
      }
      if (tokenPair.pairs.length >= 2) {
        tokenPairs.push(tokenPair);
        console.log('tokenPair', tokenPair.symbols);
      }
    }
  }

  let allPairs: ArbitragePair[] = [];
  for (const tokenPair of tokenPairs) {
    if (tokenPair.pairs.length < 2) {
      continue;
    } else if (tokenPair.pairs.length == 2) {
      allPairs.push(tokenPair as ArbitragePair);
    } else {
      // @ts-ignore
      const combinations = lodash.combinations(tokenPair.pairs, 2);
      for (const pair of combinations) {
        const arbitragePair: ArbitragePair = {
          symbols: tokenPair.symbols,
          pairs: pair,
        };
        allPairs.push(arbitragePair);
        console.log('arbitragePair', arbitragePair);
      }
    }
  }
  return allPairs;
}

function getPairsFile(network: Network) {
  return path.join(__dirname, `../pairs-${network}.json`);
}

export async function tryLoadPairs(network: Network): Promise<ArbitragePair[]> {
  let pairs: ArbitragePair[] | null;
  const pairsFile = getPairsFile(network);
  try {
    pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf-8'));
    log.info('Load pairs from json');
  } catch (err) {
    pairs = null;
  }

  if (pairs) {
    return pairs;
  }
  pairs = await updatePairs(network);

  fs.writeFileSync(pairsFile, JSON.stringify(pairs, null, 2));
  return pairs;
}
