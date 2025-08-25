// src/swap/Erc20ToUsdcDirectV3Adapter.ts
import { ethers } from 'ethers';
import { CHAINS, getProvider } from '../blockchain/config';
import { ISwapAdapter, SwapResult } from './SwapService';
import { OneshotSwapContractABI } from './EthToUsdcDirectV3Adapter';

/**
 * ERC20 to USDC swap adapter using the deployed smart contract
 * This adapter performs ERC20 token swap + split in a single transaction
 */
export class Erc20ToUsdcDirectV3Adapter implements ISwapAdapter {
  async execute(params: {
    chainKey?: string;
    fromAddress: string;
    sellToken: 'NATIVE' | string;
    buyToken: string;           // USDC address
    amountInRaw: bigint;        // Token amount in token's decimals
    slippageBps: number;        // e.g., 50 = 0.5%
    masterAddress?: string;     // Master recipient address
    feeAddress?: string;        // Fee recipient address
    feeBps?: number;            // Fee basis points (default 1000 = 10%)
  }): Promise<SwapResult> {
    const chain = CHAINS.find(c => c.key === params.chainKey);
    if (!chain || !chain.swapContract) {
      throw new Error('Swap contract not configured for this chain');
    }
    
    if (params.sellToken === 'NATIVE') {
      throw new Error('Erc20ToUsdcDirectV3Adapter only supports ERC20 tokens, not ETH');
    }

    const provider = getProvider(params.chainKey);
    
    // Contract interface for the deployed swap contract
    const swapContractInterface = new ethers.Interface(OneshotSwapContractABI);

    // Get default addresses if not provided
    const masterAddress = params.masterAddress || params.fromAddress;
    const feeAddress = params.feeAddress || params.fromAddress;
    const feeBps = params.feeBps || 1000; // 10% default

    // Use 3000 (0.3%) fee tier as default - most common for major tokens/USDC
    const feeTier = 3000;

    // Prepare the transaction using the ERC20 swap function
    const txData = swapContractInterface.encodeFunctionData('swapErc20ToUsdcAndDistribute', [
      params.sellToken,     // Token input address
      params.amountInRaw,   // Amount of tokens to swap
      masterAddress,        // Master recipient
      feeAddress,          // Fee recipient
      feeBps,              // Fee basis points (uint16)
      params.buyToken,      // USDC token address
      feeTier              // Fee tier
    ]);

    const txRequest: ethers.TransactionRequest = {
      to: chain.swapContract,
      data: txData,
      value: 0n, // No ETH needed for ERC20 swaps
    };

    // Prepare approval for the ERC20 token
    const erc20Interface = new ethers.Interface(['function approve(address spender, uint256 amount) external returns (bool)']);
    const approvalTx: ethers.TransactionRequest = {
      to: params.sellToken,
      data: erc20Interface.encodeFunctionData('approve', [chain.swapContract, params.amountInRaw]),
      value: 0n,
    };

    return {
      txHash: '',
      usdcAmountRaw: 0n, // Will be determined after execution
      router: 'erc20-to-usdc-direct-v3',
      txRequest,
      approvals: [approvalTx], // Need approval for ERC20 tokens
    };
  }
}
