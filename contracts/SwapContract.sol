// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

interface IWETH9 is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IUniswapV3SwapCallback {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}

contract EthToUsdcDirectV3 is IUniswapV3SwapCallback {
    uint160 private constant MIN_SQRT_RATIO = 4295128739 + 1;
    uint160 private constant MAX_SQRT_RATIO =
        1461446703485210103287273052203988822378723970342 - 1;

    IUniswapV3Factory public immutable factory;

    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    event SwappedAndSplit(
        address indexed sender,
        address indexed weth,
        address indexed usdc,
        uint24 feeTier,
        uint256 ethIn,
        uint256 usdcOut,
        address master,
        address feeAddr,
        uint16 bpsToMaster
    );

    constructor(address _factory) {
        require(_factory != address(0), "ZERO_FACTORY");
        factory = IUniswapV3Factory(_factory);
    }

    /// @notice Entry point: swap ETH → USDC via Uniswap V3 pool and split.
    function swapEthToUsdcAndDistribute(
        address master,
        address feeAddr,
        uint16 bps,
        address usdc,
        address weth,
        uint24 feeTier
    ) external payable nonReentrant {
        require(msg.value > 0, "NO_ETH");
        require(master != address(0) && feeAddr != address(0), "BAD_RECIPIENTS");
        require(usdc != address(0) && weth != address(0), "BAD_TOKENS");
        require(bps <= 10_000, "BPS_OOB");

        IWETH9(weth).deposit{value: msg.value}();

        uint256 usdcOut = _swapExactWethToUsdc(msg.value, usdc, weth, feeTier);

        _distributeUsdc(usdcOut, master, feeAddr, bps, usdc);
        _refundLeftoverWeth(weth);

        emit SwappedAndSplit(msg.sender, weth, usdc, feeTier, msg.value, usdcOut, master, feeAddr, bps);
    }

    /// @dev Executes the actual Uniswap V3 swap (WETH → USDC).
    function _swapExactWethToUsdc(
        uint256 wethAmount,
        address usdc,
        address weth,
        uint24 feeTier
    ) internal returns (uint256 usdcOut) {
        address pool = factory.getPool(weth, usdc, feeTier);
        require(pool != address(0), "POOL_NOT_FOUND");

        address token0 = IUniswapV3Pool(pool).token0();
        address token1 = IUniswapV3Pool(pool).token1();

        bool zeroForOne;
        if (token0 == weth && token1 == usdc) {
            zeroForOne = true;
        } else if (token0 == usdc && token1 == weth) {
            zeroForOne = false;
        } else {
            revert("POOL_TOKENS_MISMATCH");
        }

        uint256 usdcBefore = IERC20(usdc).balanceOf(address(this));

        bytes memory data = abi.encode(weth);
        IUniswapV3Pool(pool).swap(
            address(this),
            zeroForOne,
            int256(wethAmount),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            data
        );

        uint256 usdcAfter = IERC20(usdc).balanceOf(address(this));
        usdcOut = usdcAfter - usdcBefore;
        require(usdcOut > 0, "NO_USDC_OUT");
    }

    /// @dev Splits USDC balance between master and fee addresses.
    function _distributeUsdc(
        uint256 usdcOut,
        address master,
        address feeAddr,
        uint16 bps,
        address usdc
    ) internal {
        uint256 toMaster = (usdcOut * bps) / 10_000;
        uint256 toFee = usdcOut - toMaster;

        require(IERC20(usdc).transfer(master, toMaster), "USDC_MASTER_XFER_FAIL");
        require(IERC20(usdc).transfer(feeAddr, toFee), "USDC_FEE_XFER_FAIL");
    }

    /// @dev Refunds any leftover WETH (unwrapped to ETH) back to caller.
    function _refundLeftoverWeth(address weth) internal {
        uint256 leftoverWeth = IERC20(weth).balanceOf(address(this));
        if (leftoverWeth > 0) {
            IWETH9(weth).withdraw(leftoverWeth);
            (bool ok, ) = msg.sender.call{value: leftoverWeth}("");
            require(ok, "REFUND_FAIL");
        }
    }

    /// @dev Callback to pay the pool in WETH during swap.
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        address tokenIn = abi.decode(data, (address));

        if (amount0Delta > 0) {
            require(IERC20(tokenIn).transfer(msg.sender, uint256(amount0Delta)), "PAY_TOKEN0_FAIL");
        } else if (amount1Delta > 0) {
            require(IERC20(tokenIn).transfer(msg.sender, uint256(amount1Delta)), "PAY_TOKEN1_FAIL");
        } else {
            revert("NO_DELTA");
        }
    }

    receive() external payable {}
}
