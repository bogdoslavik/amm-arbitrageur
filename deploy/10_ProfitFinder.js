const { tryLoadPairs } = require('../bot/tokens');

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  const bot = await deployments.get('FlashBot');
  const pairsArray = [];

  const pairs = await tryLoadPairs('matic'); //TODO get network
  for (const key in pairs) {
    const pair = pairs[key];
    pairsArray.push(pair.pairs[0])
    pairsArray.push(pair.pairs[1])
  }
  console.log('pairsArray');
  console.log(pairsArray.join(',\n'));
  console.log('pairs.length', pairs.length);
  console.log('pairsArray.length', pairsArray.length);

  await deploy('ProfitFinder', {
    from: deployer,
    args: [bot.address],
    log: true,
    proxy: {
      methodName: 'initialize',
      args: [bot.address],
    }
  });
};
module.exports.tags = ['ProfitFinder'];
