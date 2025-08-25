// src/swap/EthToUsdcDirectV3Adapter.ts
import { ethers } from 'ethers';
import { CHAINS, getProvider } from '../blockchain/config';
import { ISwapAdapter, SwapResult } from './SwapService';

/**
 * One-shot ETH to USDC swap adapter using a custom smart contract
 * This adapter performs swap + split in a single transaction
 */
export class EthToUsdcDirectV3Adapter implements ISwapAdapter {
  async execute(params: {
    chainKey?: string;
    fromAddress: string;
    sellToken: 'NATIVE' | string;
    buyToken: string;           // USDC address
    amountInRaw: bigint;        // ETH amount in wei
    slippageBps: number;        // e.g., 50 = 0.5%
    masterAddress?: string;     // Master recipient address
    feeAddress?: string;        // Fee recipient address
    feeBps?: number;            // Fee basis points (default 1000 = 10%)
  }): Promise<SwapResult> {
    const chain = CHAINS.find(c => c.key === params.chainKey);
    if (!chain || !chain.swapContract) {
      throw new Error('Swap contract not configured for this chain');
    }
    
    if (params.sellToken !== 'NATIVE') {
      throw new Error('EthToUsdcDirectV3Adapter only supports ETH (NATIVE) input');
    }

    const provider = getProvider(params.chainKey);
    
    // Contract interface for the deployed swap contract
    const swapContractInterface = new ethers.Interface([
      'function swapEthToUsdcAndDistribute(address master, address feeAddr, uint16 bps, address usdc, address weth, uint24 feeTier) external payable',
      'function swapErc20ToUsdcAndDistribute(address tokenIn, uint256 amountIn, address master, address feeAddr, uint16 bps, address usdc, uint24 feeTier) external',
      'function splitTokens(address token, uint256 amount, address master, address feeAddr, uint16 bps) public',
    ]);

    // Get default addresses if not provided
    const masterAddress = params.masterAddress || params.fromAddress;
    const feeAddress = params.feeAddress || params.fromAddress;
    const feeBps = params.feeBps || 1000; // 10% default

    // For the new contract, we need WETH address and fee tier
    const wethAddress = chain.weth;
    if (!wethAddress) {
      throw new Error('WETH address not configured for this chain');
    }

    // Use 3000 (0.3%) fee tier as default - most common for WETH/USDC
    const feeTier = 3000;

    // Prepare the transaction using the new function signature
    const txData = swapContractInterface.encodeFunctionData('swapEthToUsdcAndDistribute', [
      masterAddress,        // Master recipient
      feeAddress,          // Fee recipient
      feeBps,              // Fee basis points (uint16)
      params.buyToken,      // USDC token address
      wethAddress,         // WETH address
      feeTier              // Fee tier
    ]);

    const txRequest: ethers.TransactionRequest = {
      to: chain.swapContract,
      data: txData,
      value: params.amountInRaw,
    };

    return {
      txHash: '',
      usdcAmountRaw: 0n, // Will be determined after execution
      router: 'eth-to-usdc-direct-v3',
      txRequest,
      approvals: [], // No approvals needed for ETH input
    };
  }
}

export const OneshotSwapContractABI = [
  "function swapEthToUsdcAndDistribute(address master, address feeAddr, uint16 bps, address usdc, address weth, uint24 feeTier) external payable",
  "function swapErc20ToUsdcAndDistribute(address tokenIn, uint256 amountIn, address master, address feeAddr, uint16 bps, address usdc, uint24 feeTier) external",
  "function splitTokens(address token, uint256 amount, address master, address feeAddr, uint16 bps) public",
  "event SwapAndSplitExecuted(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
  "event SplitExecuted(address indexed token, uint256 totalAmount, uint256 masterAmount, uint256 feeAmount)"
];
