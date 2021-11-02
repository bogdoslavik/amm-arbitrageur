//SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/EnumerableSet.sol';
import 'hardhat/console.sol';

import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IWETH.sol';
//import './libraries/Decimal.sol';

struct OrderedReserves {
    uint256 a1; // base asset
    uint256 b1;
    uint256 a2;
    uint256 b2;
}

struct ArbitrageInfo {
    address baseToken;
    address quoteToken;
    bool baseTokenSmaller;
    address lowerPool; // pool with lower price, denominated in quote asset
    address higherPool; // pool with higher price, denominated in quote asset
}

struct CallbackData {
    address debtPool;
    address targetPool;
    bool debtTokenSmaller;
    address borrowedToken;
    address debtToken;
    uint256 debtAmount;
    uint256 debtTokenOutAmount;
}

contract FlashBot is Ownable {
//    using Decimal for Decimal.D256;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint constant private _PRECISION = 10000;
    address constant private _TETUSWAP_FACTORY = 0x684d8c187be836171a1Af8D533e4724893031828;


    // WETH on ETH or WBNB on BSC, WMATIC on Polygon
    address immutable WETH;

    // AVAILABLE BASE TOKENS
    EnumerableSet.AddressSet baseTokens;

    event Withdrawn(address indexed to, uint256 indexed value);
    event BaseTokenAdded(address indexed token);
    event BaseTokenRemoved(address indexed token);

    constructor(address _WETH) {
        WETH = _WETH;
        baseTokens.add(_WETH);
    }

    function withdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(owner()).transfer(balance);
            emit Withdrawn(owner(), balance);
        }

        for (uint256 i = 0; i < baseTokens.length(); i++) {
            address token = baseTokens.at(i);
            balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                // do not use safe transfer here to prevents revert by any shitty token
                IERC20(token).transfer(owner(), balance);
            }
        }
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance >= amount) {
            IERC20(token).transfer(owner(), amount);
        } else {
            IERC20(token).transfer(owner(), balance);
        }
    }

    function addBaseToken(address token) external onlyOwner {
        baseTokens.add(token);
        emit BaseTokenAdded(token);
    }

    function removeBaseToken(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            // do not use safe transfer to prevents revert by any shitty token
            IERC20(token).transfer(owner(), balance);
        }
        baseTokens.remove(token);
        emit BaseTokenRemoved(token);
    }

    function getBaseTokens() external view returns (address[] memory tokens) {
        uint256 length = baseTokens.length();
        tokens = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            tokens[i] = baseTokens.at(i);
        }
    }

    function isbaseTokenSmaller(address pool0, address pool1)
        internal
        view
        returns (
            bool baseSmaller,
            address baseToken,
            address quoteToken
        )
    {
        require(pool0 != pool1, 'BOT: Same pair address');
        (address pool0Token0, address pool0Token1) = (IUniswapV2Pair(pool0).token0(), IUniswapV2Pair(pool0).token1());
        (address pool1Token0, address pool1Token1) = (IUniswapV2Pair(pool1).token0(), IUniswapV2Pair(pool1).token1());
        require(pool0Token0 < pool0Token1 && pool1Token0 < pool1Token1, 'BOT: Non standard uniswap AMM pair');
        require(pool0Token0 == pool1Token0 && pool0Token1 == pool1Token1, 'BOT: Require same token pair');
        require(baseTokens.contains(pool0Token0) || baseTokens.contains(pool0Token1), 'BOT: No base token in pair');

        (baseSmaller, baseToken, quoteToken) = baseTokens.contains(pool0Token0)
            ? (true, pool0Token0, pool0Token1)
            : (false, pool0Token1, pool0Token0);
    }

    /// @notice Do an arbitrage between two Uniswap-like AMM pools
    /// @dev Two pools must contains same token pair
    function flashArbitrage(address pool0, address pool1) external {
        ArbitrageInfo memory info;
        (info.baseTokenSmaller, info.baseToken, info.quoteToken) = isbaseTokenSmaller(pool0, pool1);

        OrderedReserves memory orderedReserves;
        (info.lowerPool, info.higherPool, orderedReserves) = getOrderedReserves(pool0, pool1, info.baseTokenSmaller);
        (, , OrderedReserves memory orderedReserves18) = getOrderedReserves18(pool0, pool1, info.baseTokenSmaller);

        uint256 balanceBefore = IERC20(info.baseToken).balanceOf(address(this));

        // avoid stack too deep error
        {
            uint256 borrowAmount = calcBorrowAmount(orderedReserves18); //TODO
            console.log('borrowAmount', borrowAmount);



            (uint256 amount0Out, uint256 amount1Out) =
            info.baseTokenSmaller ? (uint256(0), borrowAmount) : (borrowAmount, uint256(0));
            // borrow quote token on lower price pool, calculate how much debt we need to pay denominated in base token
            uint256 fee1 = getFee(info.lowerPool);
            console.log('fee1', fee1);
            uint256 debtAmount = getAmountIn(borrowAmount, orderedReserves.a1, orderedReserves.b1, fee1);
            console.log('debtAmount', debtAmount);
            // sell borrowed quote token on higher price pool, calculate how much base token we can get
            uint256 fee2 = getFee(info.higherPool);
            console.log('fee2', fee2);
            uint256 baseTokenOutAmount = getAmountOut(borrowAmount, orderedReserves.b2, orderedReserves.a2, fee2);
            require(baseTokenOutAmount > debtAmount, 'BOT: Arbitrage fail, no profit');
            console.log('Profit:', (baseTokenOutAmount - debtAmount) /* / 1 ether*/);

            CallbackData memory callbackData;
            callbackData.debtPool = info.lowerPool;
            callbackData.targetPool = info.higherPool;
            callbackData.debtTokenSmaller = info.baseTokenSmaller;
            callbackData.borrowedToken = info.quoteToken;
            callbackData.debtToken = info.baseToken;
            callbackData.debtAmount = debtAmount;
            callbackData.debtTokenOutAmount = baseTokenOutAmount;

            bytes memory data;

            uint256 baseTokenBalance = IERC20(callbackData.debtToken).balanceOf(address(this));
            console.log('baseTokenBalance', baseTokenBalance);

//                require(callbackData.debtAmount<baseTokenBalance, 'BOT: Not enough base token balance');
            uint256 ratio = _PRECISION;
            // if we have not enough base token amount, then calculate ration of debtAmount
            if (callbackData.debtAmount>baseTokenBalance) {
                ratio = baseTokenBalance.mul(_PRECISION).div(callbackData.debtAmount);
                console.log('new ratio', ratio);
            }

            IERC20(callbackData.debtToken).safeTransfer(callbackData.debtPool, part(callbackData.debtAmount, ratio));

            IUniswapV2Pair(info.lowerPool).swap(part(amount0Out,ratio), part(amount1Out, ratio), address(this), data);

            uint256 borrowedAmount = amount0Out > 0 ? amount0Out : amount1Out;

            IERC20(callbackData.borrowedToken).safeTransfer(callbackData.targetPool, part(borrowedAmount,ratio));

            (uint256 amount0Out2, uint256 amount1Out2) =
            callbackData.debtTokenSmaller ? (callbackData.debtTokenOutAmount, uint256(0)) : (uint256(0), callbackData.debtTokenOutAmount);
            IUniswapV2Pair(callbackData.targetPool).swap(part(amount0Out2,ratio), part(amount1Out2,ratio), address(this), new bytes(0));

        }

        uint256 balanceAfter = IERC20(info.baseToken).balanceOf(address(this));
        require(balanceAfter > balanceBefore, 'BOT: Losing money');
        uint256 profit = balanceAfter-balanceBefore;
//        console.log('profit', balanceAfter-balanceBefore);
        IERC20(info.baseToken).transfer(owner(), profit);


    }


    /// @notice Calculate how much profit we can by arbitraging between two pools
    function getProfit(address pool0, address pool1) external view returns (uint256 profit, address baseToken) {
        (bool baseTokenSmaller, , ) = isbaseTokenSmaller(pool0, pool1);
        baseToken          = baseTokenSmaller ? IUniswapV2Pair(pool0).token0() : IUniswapV2Pair(pool0).token1();
        address quoteToken = baseTokenSmaller ? IUniswapV2Pair(pool0).token1() : IUniswapV2Pair(pool0).token0();

        (address p1, address p2, OrderedReserves memory orderedReserves) = getOrderedReserves(pool0, pool1, baseTokenSmaller);
        (, , OrderedReserves memory orderedReserves18) = getOrderedReserves18(pool0, pool1, baseTokenSmaller);

        uint256 borrowAmount = calcBorrowAmount(orderedReserves18);
        uint8 quoteDecimals = ERC20(quoteToken).decimals();
        borrowAmount = borrowAmount.mul(10*quoteDecimals).div(10*18);

        // borrow quote token on lower price pool,
        uint256 fee1 = getFee(p1);
        uint256 debtAmount = getAmountIn(borrowAmount, orderedReserves.a1, orderedReserves.b1, fee1);
        // sell borrowed quote token on higher price pool
        uint256 fee2 = getFee(p2);
        uint256 baseTokenOutAmount = getAmountOut(borrowAmount, orderedReserves.b2, orderedReserves.a2, fee2);
        if (baseTokenOutAmount < debtAmount) {
            profit = 0;
        } else {
            profit = baseTokenOutAmount - debtAmount;
        }
    }



    // copy from UniswapV2Library
    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 fee
    ) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, 'BOT: UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'BOT: UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        uint256 numerator = reserveIn.mul(amountOut).mul(_PRECISION);
        uint256 denominator = reserveOut.sub(amountOut).mul(_PRECISION-fee);
        amountIn = (numerator / denominator).add(1);
    }

    // copy from UniswapV2Library
    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 fee
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, 'BOT: UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'BOT: UniswapV2Library: INSUFFICIENT_LIQUIDITY');
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

    receive() external payable {}


}
