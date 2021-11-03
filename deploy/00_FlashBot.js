module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const args = [
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
    ]
  ];
  await deploy('FlashBot', {
    from: deployer,
    args,
    log: true,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      init: {
        methodName: 'initialize',
        args
      }
    }
  });
};
module.exports.tags = ['FlashBot'];
