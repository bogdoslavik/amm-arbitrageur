module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  await deploy('FlashBot', {
    from: deployer,
    args: ['0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'],
    log: true,
  });
};
module.exports.tags = ['FlashBot'];
