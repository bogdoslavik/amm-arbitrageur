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

    // ACCESS CONTROL
    // Only the `permissionedPairAddress` may call the `uniswapV2Call` function
    address permissionedPairAddress = address(1);

    // WETH on ETH or WBNB on BSC
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

    function baseTokensContains(address token) public view returns (bool) {
        return baseTokens.contains(token);
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
        require(baseTokensContains(pool0Token0) || baseTokensContains(pool0Token1), 'BOT: No base token in pair');

        (baseSmaller, baseToken, quoteToken) = baseTokensContains(pool0Token0)
            ? (true, pool0Token0, pool0Token1)
            : (false, pool0Token1, pool0Token0);
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
        (uint256  price0, uint256 price1) =
            baseTokenSmaller //TODO DECIMALS
                ? (pool0Reserve0.div(pool0Reserve1), pool1Reserve0.div(pool1Reserve1))
                : (pool0Reserve1.div(pool0Reserve0), pool1Reserve1.div(pool1Reserve0));

        // get a1, b1, a2, b2 with following rule:
        // 1. (a1, b1) represents the pool with lower price, denominated in quote asset token
        // 2. (a1, a2) are the base tokens in two pools
        if (price0 < price1) {
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
        console.log('Borrow from pool:', lowerPool);
        console.log('Sell to pool:', higherPool);
    }
    /// @dev Compare price denominated in quote token between two pools. In 18 decimals
    function getOrderedReserves18(
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

        uint8 token0decimals = ERC20(IUniswapV2Pair(pool0).token0()).decimals();
        uint8 token1decimals = ERC20(IUniswapV2Pair(pool0).token1()).decimals();

        pool0Reserve0 = pool0Reserve0.mul(10**18).div(10**token0decimals);
        pool0Reserve1 = pool0Reserve1.mul(10**18).div(10**token1decimals);

        pool1Reserve0 = pool1Reserve0.mul(10**18).div(10**token0decimals);
        pool1Reserve1 = pool1Reserve1.mul(10**18).div(10**token1decimals);

        // Calculate the price denominated in quote asset token
        (uint256 price0, uint256 price1) =
            baseTokenSmaller //TODO DECIMALS
                ? (pool0Reserve0.div(pool0Reserve1), pool1Reserve0.div(pool1Reserve1))
                : (pool0Reserve1.div(pool0Reserve0), pool1Reserve1.div(pool1Reserve0));

        // get a1, b1, a2, b2 with following rule:
        // 1. (a1, b1) represents the pool with lower price, denominated in quote asset token
        // 2. (a1, a2) are the base tokens in two pools
        if (price0 < price1) {
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
        console.log('Borrow from pool:', lowerPool);
        console.log('Sell to pool:', higherPool);
    }

    /// @notice Do an arbitrage between two Uniswap-like AMM pools
    /// @dev Two pools must contains same token pair
    function flashArbitrage(address pool0, address pool1) external {
        ArbitrageInfo memory info;
        (info.baseTokenSmaller, info.baseToken, info.quoteToken) = isbaseTokenSmaller(pool0, pool1);

        OrderedReserves memory orderedReserves;
        (info.lowerPool, info.higherPool, orderedReserves) = getOrderedReserves(pool0, pool1, info.baseTokenSmaller);
        (, , OrderedReserves memory orderedReserves18) = getOrderedReserves18(pool0, pool1, info.baseTokenSmaller);

        // this must be updated every transaction for callback origin authentication
        permissionedPairAddress = info.lowerPool;

        uint256 balanceBefore = IERC20(info.baseToken).balanceOf(address(this));

        // avoid stack too deep error
        {
            uint256 borrowAmount = calcBorrowAmount(orderedReserves18);
            uint8 quoteDecimals = ERC20(info.quoteToken).decimals();
            borrowAmount = borrowAmount.mul(10*quoteDecimals).div(10*18);
            console.log('borrowAmount', borrowAmount);

            if (IUniswapV2Pair(info.lowerPool).factory()==_TETUSWAP_FACTORY) { // no flash swap
                console.log('Tetu swap behavior');

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


            } else { // default flash swap behavior
                console.log('Default flash swap behavior');
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
                require(baseTokenOutAmount > debtAmount, 'BOT: Flash arbitrage fail, no profit');
                console.log('Profit:', (baseTokenOutAmount - debtAmount)/* / 1 ether*/);

                // can only initialize this way to avoid stack too deep error
                CallbackData memory callbackData;
                callbackData.debtPool = info.lowerPool;
                callbackData.targetPool = info.higherPool;
                callbackData.debtTokenSmaller = info.baseTokenSmaller;
                callbackData.borrowedToken = info.quoteToken;
                callbackData.debtToken = info.baseToken;
                callbackData.debtAmount = debtAmount;
                callbackData.debtTokenOutAmount = baseTokenOutAmount;

                bytes memory data = abi.encode(callbackData);
                IUniswapV2Pair(info.lowerPool).swap(amount0Out, amount1Out, address(this), data);

            }
        }

        uint256 balanceAfter = IERC20(info.baseToken).balanceOf(address(this));
        require(balanceAfter > balanceBefore, 'BOT: Losing money');
        uint256 profit = balanceAfter-balanceBefore;
//        console.log('profit', balanceAfter-balanceBefore);
        IERC20(info.baseToken).transfer(owner(), profit);

//        if (info.baseToken == WETH) {
//            IWETH(info.baseToken).withdraw(balanceAfter);
//        }
        permissionedPairAddress = address(1);
    }

    function part(uint256 amount, uint256 ratio) private pure returns (uint256) {
        return amount.mul(ratio).div(_PRECISION);
    }

    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes memory data
    ) public {
        // access control
        require(msg.sender == permissionedPairAddress, 'BOT: Non permissioned address call');
        require(sender == address(this), 'BOT: Not from this contract');

        uint256 borrowedAmount = amount0 > 0 ? amount0 : amount1;
        CallbackData memory info = abi.decode(data, (CallbackData));

        IERC20(info.borrowedToken).safeTransfer(info.targetPool, borrowedAmount);

        (uint256 amount0Out, uint256 amount1Out) =
            info.debtTokenSmaller ? (info.debtTokenOutAmount, uint256(0)) : (uint256(0), info.debtTokenOutAmount);
        IUniswapV2Pair(info.targetPool).swap(amount0Out, amount1Out, address(this), new bytes(0));

        IERC20(info.debtToken).safeTransfer(info.debtPool, info.debtAmount);
    }

    /// @notice Calculate how much profit we can by arbitraging between two pools
    function getProfit(address pool0, address pool1) external view returns (uint256 profit, address baseToken) {
        (bool baseTokenSmaller, address _baseToken, address quoteToken) = isbaseTokenSmaller(pool0, pool1);
//        baseToken = baseTokenSmaller ? IUniswapV2Pair(pool0).token0() : IUniswapV2Pair(pool0).token1();
        baseToken = _baseToken;

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

    /// @dev calculate the maximum base asset amount to borrow in order to get maximum profit during arbitrage
    function calcBorrowAmount(OrderedReserves memory reserves) internal pure returns (uint256 amount) {
        // we can't use a1,b1,a2,b2 directly, because it will result overflow/underflow on the intermediate result
        // so we:
        //    1. divide all the numbers by d to prevent from overflow/underflow
        //    2. calculate the result by using above numbers
        //    3. multiply d with the result to get the final result
        // Note: this workaround is only suitable for ERC20 token with 18 decimals, which I believe most tokens do

        uint256 min1 = reserves.a1 < reserves.b1 ? reserves.a1 : reserves.b1;
        uint256 min2 = reserves.a2 < reserves.b2 ? reserves.a2 : reserves.b2;
        uint256 min = min1 < min2 ? min1 : min2;

        // choose appropriate number to divide based on the minimum number
        uint256 d;
        if (min > 1e24) {
            d = 1e20;
        } else if (min > 1e23) {
            d = 1e19;
        } else if (min > 1e22) {
            d = 1e18;
        } else if (min > 1e21) {
            d = 1e17;
        } else if (min > 1e20) {
            d = 1e16;
        } else if (min > 1e19) {
            d = 1e15;
        } else if (min > 1e18) {
            d = 1e14;
        } else if (min > 1e17) {
            d = 1e13;
        } else if (min > 1e16) {
            d = 1e12;
        } else if (min > 1e15) {
            d = 1e11;
        } else if (min > 1e14) {
            d = 1e10;
        } else if (min > 1e13) {
            d = 1e9;
        } else if (min > 1e12) {
            d = 1e8;
        } else if (min > 1e11) {
            d = 1e7;
        } else if (min > 1e10) {
            d = 1e6;
        } else if (min > 1e9) {
            d = 1e5;
        } else {
            d = 1e4;
        }

        (int256 a1, int256 a2, int256 b1, int256 b2) =
            (int256(reserves.a1 / d), int256(reserves.a2 / d), int256(reserves.b1 / d), int256(reserves.b2 / d));

        int256 a = a1 * b1 - a2 * b2;
        int256 b = 2 * b1 * b2 * (a1 + a2);
        int256 c = b1 * b2 * (a1 * b2 - a2 * b1);

        (int256 x1, int256 x2) = calcSolutionForQuadratic(a, b, c);

        // 0 < x < b1 and 0 < x < b2
        require((x1 > 0 && x1 < b1 && x1 < b2) || (x2 > 0 && x2 < b1 && x2 < b2), 'BOT: Wrong input order');
        amount = (x1 > 0 && x1 < b1 && x1 < b2) ? uint256(x1) * d : uint256(x2) * d;
    }

    /// @dev find solution of quadratic equation: ax^2 + bx + c = 0, only return the positive solution
    function calcSolutionForQuadratic(
        int256 a,
        int256 b,
        int256 c
    ) internal pure returns (int256 x1, int256 x2) {
        int256 m = b**2 - 4 * a * c;
        // m < 0 leads to complex number
        require(m > 0, 'BOT: Complex number');

        int256 sqrtM = int256(sqrt(uint256(m)));
        x1 = (-b + sqrtM) / (2 * a);
        x2 = (-b - sqrtM) / (2 * a);
    }

    /// @dev Newton’s method for calculating square root of n
    function sqrt(uint256 n) internal pure returns (uint256 res) {
        assert(n > 1);

        // The scale factor is a crude way to turn everything into integer calcs.
        // Actually do (n * 10 ^ 4) ^ (1/2)
        uint256 _n = n * 10**6;
        uint256 c = _n;
        res = _n;

        uint256 xi;
        while (true) {
            xi = (res + c / res) / 2;
            // don't need be too precise to save gas
            if (res - xi < 1000) {
                break;
            }
            res = xi;
        }
        res = res / 10**3;
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
        try IUniswapV2Pair(pair).fee() returns (uint fee) {
            return fee;
        } catch Error(string memory /*reason*/) {
//        } catch Panic(uint /*errorCode*/) {
        } catch (bytes memory /*lowLevelData*/) {
        }
        return 30;
    }

    receive() external payable {}


    /// @dev Redirect uniswap callback function
    /// The callback function on different DEX are not same, so use a fallback to redirect to uniswapV2Call
    fallback(bytes calldata _input) external returns (bytes memory) {
        (address sender, uint256 amount0, uint256 amount1, bytes memory data) = abi.decode(_input[4:], (address, uint256, uint256, bytes));
        console.log('falllback uniswapV2Call sender, amount0, amount1', sender, amount0, amount1);
        uniswapV2Call(sender, amount0, amount1, data);
    }

}
