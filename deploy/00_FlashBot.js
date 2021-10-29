module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  await deploy('FlashBot', {
    from: deployer,
    args: ['0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'],
    log: true,
  });
};
module.exports.tags = ['FlashBot'];
