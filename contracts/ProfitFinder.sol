//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './libraries/ContractOwnable.sol';
import './FlashBot.sol';
import 'hardhat/console.sol';

contract ProfitFinder is ContractOwnable, Initializable {
    using Decimal for Decimal.D256;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint constant private _PRECISION = 10000;
    address constant private _TETUSWAP_FACTORY = 0x684d8c187be836171a1Af8D533e4724893031828;

    FlashBot public bot;
    address[] public pools;
    // ADD NEW VARS BELOW !!!

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

    function findProfitOptimized() public view
    returns (address profitablePool0, address profitablePool1, uint256 maxProfit, address profitableBaseToken) {
        maxProfit = 0;
        profitablePool0 = address(0);
        profitablePool1 = address(0);
        profitableBaseToken = address(0);

        // base tokes cache
        address[] memory baseTokensArray = bot.getBaseTokens();
        // balances cache
        uint256[] memory baseTokensBalances = new uint256[](baseTokensArray.length);

        uint256 len = pools.length;
        for (uint256 i = 0; i < len; i+=2) {
            address pool0 = pools[i];
            address pool1 = pools[i+1];
            address pairBaseToken;

            // getProfit func
            uint256 profit = 0;
            { // stack to deep
                (bool baseTokenSmaller, address baseToken, ,uint256 baseTokenIndex) =
                    isBaseTokenSmaller(pool0, pool1, baseTokensArray);
                pairBaseToken = baseToken;

                (address p1, address p2, OrderedReserves memory orderedReserves) = getOrderedReserves(pool0, pool1, baseTokenSmaller);

                // cache base token balance
                uint256 baseStartAmount = baseTokensBalances[baseTokenIndex];
                if (baseStartAmount == 0) {
                    baseStartAmount = IERC20(baseToken).balanceOf(address(this));
                    baseTokensBalances[baseTokenIndex] = baseStartAmount;
                }

                // sell base token on lower price pool for quite token,
                uint256 fee1 = getFee(p1);
                uint256 quoteOutAmount = getAmountOut(baseStartAmount, orderedReserves.a1, orderedReserves.b1, fee1);
                // sell quote token on higher price pool
                uint256 fee2 = getFee(p2);
                uint256 baseOutAmount = getAmountOut(quoteOutAmount, orderedReserves.b2, orderedReserves.a2, fee2);

                if (baseOutAmount < baseStartAmount) {
                    profit = 0;
                } else {
                    profit = baseOutAmount - baseStartAmount;
//                    console.log('+profit', profit);
                }
            }

            if (profit > maxProfit) {
                maxProfit = profit;
                profitableBaseToken = pairBaseToken;
                profitablePool0 = pool0;
                profitablePool1 = pool1;
            }
        }
    }

    /// @dev Compare price denominated in quote token between two pools
    /// We borrow base token by using flash swap from lower price pool and sell them to higher price pool
    function getOrderedReserves(
        address pool0,
        address pool1,
        bool baseTokenSmaller
    )
    internal
    view
    returns (
        address lowerPool,
        address higherPool,
        OrderedReserves memory orderedReserves
    )
    {
        (uint256 pool0Reserve0, uint256 pool0Reserve1, ) = IUniswapV2Pair(pool0).getReserves();
        (uint256 pool1Reserve0, uint256 pool1Reserve1, ) = IUniswapV2Pair(pool1).getReserves();

        // Calculate the price denominated in quote asset token
        (Decimal.D256 memory price0, Decimal.D256 memory price1) =
        baseTokenSmaller
        ? (Decimal.from(pool0Reserve0).div(pool0Reserve1), Decimal.from(pool1Reserve0).div(pool1Reserve1))
        : (Decimal.from(pool0Reserve1).div(pool0Reserve0), Decimal.from(pool1Reserve1).div(pool1Reserve0));

        // get a1, b1, a2, b2 with following rule:
        // 1. (a1, b1) represents the pool with lower price, denominated in quote asset token
        // 2. (a1, a2) are the base tokens in two pools
        if (price0.lessThan(price1)) {
            (lowerPool, higherPool) = (pool0, pool1);
            (orderedReserves.a1, orderedReserves.b1, orderedReserves.a2, orderedReserves.b2) = baseTokenSmaller
            ? (pool0Reserve0, pool0Reserve1, pool1Reserve0, pool1Reserve1)
            : (pool0Reserve1, pool0Reserve0, pool1Reserve1, pool1Reserve0);
        } else {
            (lowerPool, higherPool) = (pool1, pool0);
            (orderedReserves.a1, orderedReserves.b1, orderedReserves.a2, orderedReserves.b2) = baseTokenSmaller
            ? (pool1Reserve0, pool1Reserve1, pool0Reserve0, pool0Reserve1)
            : (pool1Reserve1, pool1Reserve0, pool0Reserve1, pool0Reserve0);
        }
//        console.log('-Buy from pool:', lowerPool);
//        console.log('-Sell  to pool:', higherPool);
    }

    // copy from UniswapV2Library
    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 fee
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, 'FINDER: UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'FINDER: UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        uint256 amountInWithFee = amountIn.mul(_PRECISION-fee);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(_PRECISION).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    function getFee(address pair) internal view returns(uint) {
        if (IUniswapV2Pair(pair).factory()==_TETUSWAP_FACTORY) {
            try IUniswapV2Pair(pair).fee() returns (uint fee) {
                return fee;
            } catch Error(string memory /*reason*/) {
            } catch (bytes memory /*lowLevelData*/) {
            }
        }
        return 30;
    }

    function isBaseTokenSmaller(address pool0, address pool1, address[] memory baseTokensArray)
    internal
    view
    returns (
        bool baseSmaller,
        address baseToken,
        address quoteToken,
        uint256 baseTokenIndex
    )
    {
        require(pool0 != pool1, 'BOT: Same pair address');
        (address pool0Token0, address pool0Token1) = (IUniswapV2Pair(pool0).token0(), IUniswapV2Pair(pool0).token1());
        (address pool1Token0, address pool1Token1) = (IUniswapV2Pair(pool1).token0(), IUniswapV2Pair(pool1).token1());
        require(pool0Token0 < pool0Token1 && pool1Token0 < pool1Token1, 'BOT: Non standard uniswap AMM pair');
        require(pool0Token0 == pool1Token0 && pool0Token1 == pool1Token1, 'BOT: Require same token pair');
//        require(baseTokens.contains(pool0Token0) || baseTokens.contains(pool0Token1), 'BOT: No base token in pair');

        baseTokenIndex = 0;
        bool baseTokensContains = false;
        uint256 len = baseTokensArray.length;
        for (uint256 i=0; i<len; i++) {
            if (baseTokensArray[i] == pool0Token0) {
                baseTokensContains = true;
                baseTokenIndex = i;
            }
        }
        (baseSmaller, baseToken, quoteToken) = baseTokensContains
            ? (true, pool0Token0, pool0Token1)
            : (false, pool0Token1, pool0Token0);
    }

}
