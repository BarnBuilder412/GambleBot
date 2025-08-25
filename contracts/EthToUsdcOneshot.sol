// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* --------------------------- Interfaces --------------------------- */
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IWETH9 is IERC20 {
    function deposit() external payable;
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

/* --------------------------- Contract --------------------------- */
contract EthToUsdcDirectV3 is IUniswapV3SwapCallback {
    uint160 private constant MIN_SQRT_RATIO = 4295128739 + 1;
    uint160 private constant MAX_SQRT_RATIO =
        1461446703485210103287273052203988822378723970342 - 1;

    IUniswapV3Factory public immutable factory;

    /* --------------------------- Events --------------------------- */
    event SwapAndSplitExecuted(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event SplitExecuted(
        address indexed token,
        uint256 totalAmount,
        uint256 masterAmount,
        uint256 feeAmount
    );

    constructor(address _factory) {
        require(_factory != address(0), "ZERO_FACTORY");
        factory = IUniswapV3Factory(_factory);
    }

    /* --------------------------- 1. Swap ETH → USDC --------------------------- */
    function swapEthToUsdcAndDistribute(
        address master,
        address feeAddr,
        uint16 bps,
        address usdc,
        address weth,
        uint24 feeTier
    ) external payable {
        require(msg.value > 0, "NO_ETH");
        require(master != address(0) && feeAddr != address(0), "BAD_RECIPIENTS");
        require(usdc != address(0) && weth != address(0), "BAD_TOKENS");
        require(bps <= 10_000, "BPS_OOB");

        // Wrap ETH into WETH
        IWETH9(weth).deposit{value: msg.value}();

        // Swap WETH → USDC
        uint256 usdcOut = _swapExactTokenToUsdc(weth, msg.value, usdc, feeTier);

        // Split USDC between master and feeAddr
        _splitTokens(usdc, usdcOut, master, feeAddr, bps);

        emit SwapAndSplitExecuted(msg.sender, weth, usdc, msg.value, usdcOut);
    }

    /* --------------------------- 2. Swap ERC20 → USDC --------------------------- */
    function swapErc20ToUsdcAndDistribute(
        address tokenIn,
        uint256 amountIn,
        address master,
        address feeAddr,
        uint16 bps,
        address usdc,
        uint24 feeTier
    ) external {
        require(amountIn > 0, "NO_AMOUNT");
        require(master != address(0) && feeAddr != address(0), "BAD_RECIPIENTS");
        require(tokenIn != address(0) && usdc != address(0), "BAD_TOKENS");
        require(bps <= 10_000, "BPS_OOB");

        // Pull tokens from user
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "TRANSFER_FAIL");

        // Swap tokenIn → USDC
        uint256 usdcOut = _swapExactTokenToUsdc(tokenIn, amountIn, usdc, feeTier);

        // Split USDC between master and feeAddr
        _splitTokens(usdc, usdcOut, master, feeAddr, bps);

        emit SwapAndSplitExecuted(msg.sender, tokenIn, usdc, amountIn, usdcOut);
    }

    /* --------------------------- 3. Split Tokens --------------------------- */
    function splitTokens(
        address token,
        uint256 amount,
        address master,
        address feeAddr,
        uint16 bps
    ) external {
        require(amount > 0, "NO_AMOUNT");
        require(master != address(0) && feeAddr != address(0), "BAD_RECIPIENTS");
        require(token != address(0), "BAD_TOKEN");
        require(bps <= 10_000, "BPS_OOB");

        // Pull tokens from caller
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FAIL");

        _splitTokens(token, amount, master, feeAddr, bps);
    }

    /* --------------------------- Internal Split --------------------------- */
    function _splitTokens(
        address token,
        uint256 amount,
        address master,
        address feeAddr,
        uint16 bps
    ) internal {
        uint256 toMaster = (amount * bps) / 10_000;
        uint256 toFee = amount - toMaster;

        require(IERC20(token).transfer(master, toMaster), "MASTER_TRANSFER_FAIL");
        require(IERC20(token).transfer(feeAddr, toFee), "FEE_TRANSFER_FAIL");

        emit SplitExecuted(token, amount, toMaster, toFee);
    }

    /* --------------------------- Internal Swap --------------------------- */
    function _swapExactTokenToUsdc(
        address tokenIn,
        uint256 amountIn,
        address usdc,
        uint24 feeTier
    ) internal returns (uint256 usdcOut) {
        address pool = factory.getPool(tokenIn, usdc, feeTier);
        require(pool != address(0), "POOL_NOT_FOUND");

        // check token ordering
        address token0 = IUniswapV3Pool(pool).token0();
        address token1 = IUniswapV3Pool(pool).token1();

        bool zeroForOne;
        if (token0 == tokenIn && token1 == usdc) {
            zeroForOne = true;
        } else if (token0 == usdc && token1 == tokenIn) {
            zeroForOne = false;
        } else {
            revert("POOL_TOKENS_MISMATCH");
        }

        uint256 usdcBefore = IERC20(usdc).balanceOf(address(this));

        bytes memory data = abi.encode(tokenIn);
        IUniswapV3Pool(pool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            data
        );

        uint256 usdcAfter = IERC20(usdc).balanceOf(address(this));
        usdcOut = usdcAfter - usdcBefore;
        require(usdcOut > 0, "NO_USDC_OUT");
    }

    /* --------------------------- Uniswap V3 Callback --------------------------- */
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
