//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/proxy/utils/Initializable.sol';
import './libraries/ContractOwnable.sol';
import './FlashBot.sol';
import 'hardhat/console.sol';

contract ProfitFinder is ContractOwnable, Initializable {
    FlashBot public bot;
    address[] public pools;
    // ADD NEW VARS BELOW

    constructor (address payable _bot) {
        initialize(_bot);
    }

    function initialize(address payable _bot) public onlyOwner {
        initOwner(_msgSender());
        bot = FlashBot(_bot);
    }

    function setBot(address payable _bot) public onlyOwner {
        bot = FlashBot(_bot);
    }

    function addPools(address[] memory _pools) public onlyOwner {
        for (uint256 i = 0; i < _pools.length; i++) {
            pools.push(_pools[i]);
        }
    }

    function setPools(address[] memory _pools) public onlyOwner {
        delete pools;
        addPools(_pools);
    }

    function pairsCount() public view returns (uint256)  {
        return pools.length / 2;
    }

    function findProfit() public view
    returns (address pool0, address pool1, uint256 profit, address baseToken) {
        profit = 0;
        pool0 = address(0);
        pool1 = address(0);
        baseToken = address(0);

        uint256 len = pools.length;
        for (uint256 i = 0; i < len; i+=2) {
            address p0 = pools[i];
            address p1 = pools[i+1];
            // try for some buggy pools that can revert
            try bot.getProfit(p0, p1) returns (uint256 _profit, address _baseToken) {
                if (_profit > profit) {
                    profit = _profit;
                    baseToken = _baseToken;
                    pool0 = p0;
                    pool1 = p1;
                }
            } catch Error(string memory) {
            } catch (bytes memory) {
            }
        }
    }

}
