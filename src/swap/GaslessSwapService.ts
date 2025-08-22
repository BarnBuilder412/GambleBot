// src/swap/GaslessSwapService.ts
import { ethers } from 'ethers';
import { CHAINS, getProvider } from '../blockchain/config';

export interface GaslessSwapRequest {
  chainKey?: string;
  fromAddress: string;
  sellToken: 'NATIVE' | string;
  buyToken: string;
  amountInRaw: bigint;
  slippageBps: number;
  deadline?: number;
}

export interface GaslessSwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  usdcAmountRaw: bigint;
  gasUsed?: bigint;
  gasCost?: bigint;
}

export class GaslessSwapService {
  private gasWallet: ethers.Wallet;
  private gasWalletProvider: ethers.JsonRpcProvider;

  constructor(
    private readonly gasWalletPrivateKey: string,
    private readonly chainKey: string = 'eth_sepolia'
  ) {
    const provider = getProvider(this.chainKey);
    this.gasWalletProvider = provider;
    this.gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);
  }

  /**
   * Execute a gasless swap by having the gas wallet pay for gas
   * while the user's tokens are swapped
   */
  async executeGaslessSwap(request: GaslessSwapRequest): Promise<GaslessSwapResult> {
    try {
      const chain = CHAINS.find(c => c.key === request.chainKey || this.chainKey);
      if (!chain) {
        throw new Error(`Chain configuration not found for: ${request.chainKey || this.chainKey}`);
      }

      const provider = getProvider(request.chainKey || this.chainKey);
      const deadline = request.deadline || Math.floor(Date.now() / 1000) + 300; // 5 min default

      // Check gas wallet balance
      const gasWalletBalance = await this.gasWalletProvider.getBalance(this.gasWallet.address);
      const estimatedGas = await this.estimateSwapGas(request, provider);
      const gasPrice = await this.gasWalletProvider.getFeeData();
      const maxFeePerGas = gasPrice.maxFeePerGas || gasPrice.gasPrice || ethers.parseUnits('20', 'gwei');
      const estimatedGasCost = estimatedGas * maxFeePerGas;

      if (gasWalletBalance < estimatedGasCost) {
        throw new Error(`Insufficient gas wallet balance. Required: ${ethers.formatEther(estimatedGasCost)} ETH, Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
      }

      // Create the swap transaction
      const swapTx = await this.createSwapTransaction(request, provider, deadline);
      
      // Execute the swap using gas wallet
      const txResponse = await this.gasWallet.sendTransaction({
        ...swapTx,
        maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas || ethers.parseUnits('1.5', 'gwei'),
      });

      console.log(`🔄 Gasless swap transaction sent: ${txResponse.hash}`);
      
      // Wait for confirmation
      const receipt = await txResponse.wait();
      
      if (receipt && receipt.status === 1) {
        // Calculate USDC amount received (this would need to be enhanced with actual swap logic)
        const usdcAmountRaw = await this.calculateUSDCReceived(request, receipt, provider);
        
        return {
          success: true,
          txHash: receipt.hash,
          usdcAmountRaw,
          gasUsed: receipt.gasUsed,
          gasCost: receipt.gasUsed * maxFeePerGas,
        };
      } else {
        throw new Error('Transaction failed or receipt is null');
      }

    } catch (error) {
      console.error('❌ Gasless swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usdcAmountRaw: 0n,
      };
    }
  }

  /**
   * Estimate gas for the swap transaction
   */
  private async estimateSwapGas(request: GaslessSwapRequest, provider: ethers.JsonRpcProvider): Promise<bigint> {
    try {
      // Create a dummy transaction to estimate gas
      const dummyTx = await this.createSwapTransaction(request, provider, Math.floor(Date.now() / 1000) + 300);
      
      // Estimate gas (this is a rough estimate, actual implementation would be more precise)
      const estimatedGas = await provider.estimateGas({
        from: this.gasWallet.address,
        to: dummyTx.to,
        data: dummyTx.data,
        value: dummyTx.value || 0n,
      });

      // Add buffer for safety
      return estimatedGas * 120n / 100n; // 20% buffer
    } catch (error) {
      console.warn('Could not estimate gas, using default:', error);
      // Return conservative estimate
      return ethers.parseUnits('300000', 'wei'); // 300k gas
    }
  }

  /**
   * Create the swap transaction data
   */
  private async createSwapTransaction(
    request: GaslessSwapRequest, 
    provider: ethers.JsonRpcProvider, 
    deadline: number
  ): Promise<ethers.TransactionRequest> {
    const chain = CHAINS.find(c => c.key === request.chainKey || this.chainKey);
    if (!chain || !chain.swapRouter02) {
      throw new Error('SwapRouter02 not configured for this chain');
    }

    let tokenIn = request.sellToken === 'NATIVE' ? (chain.weth as string) : request.sellToken;

    // Get router interface
    const routerIntf = new ethers.Interface([
      'function factory() view returns (address)',
      'function WETH9() view returns (address)',
      'function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'
    ]);

    const router = new ethers.Contract(chain.swapRouter02, routerIntf, provider);

    // Get factory and WETH addresses
    let routerFactoryAddress: string | undefined = chain.uniswapV3Factory;
    try { 
      routerFactoryAddress = await router.factory(); 
    } catch {}
    
    if (!routerFactoryAddress) {
      throw new Error('Router does not expose factory() and no factory configured');
    }

    try {
      if (request.sellToken === 'NATIVE') {
        const routerWeth: string = await router.WETH9();
        if (routerWeth) tokenIn = routerWeth;
      }
    } catch {}

    // Try common Uniswap V3 fee tiers in order and select first pool with liquidity
    const factory = new ethers.Contract(routerFactoryAddress, [
      'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)'
    ], provider);
    const feeTiers = [500, 3000, 10000, 100];
    let selectedFee: number | null = null;
    let poolAddr: string | null = null;
    for (const fee of feeTiers) {
      const addr: string = await factory.getPool(tokenIn, request.buyToken, fee);
      if (addr && addr !== ethers.ZeroAddress) {
        try {
          const pool = new ethers.Contract(addr, [
            'function liquidity() view returns (uint128)'
          ], provider);
          const liquidity: bigint = await pool.liquidity();
          if (liquidity > 0n) {
            selectedFee = fee;
            poolAddr = addr;
            break;
          }
        } catch {}
      }
    }
    if (!selectedFee || !poolAddr) {
      throw new Error('No Uniswap V3 pool with liquidity found for token pair across common fee tiers');
    }

    // Minimum out: set to 0 to avoid revert (production should use a quoter)
    const minOut = 0n;

    const data = routerIntf.encodeFunctionData('exactInputSingle', [{
      tokenIn,
      tokenOut: request.buyToken,
      fee: selectedFee,
      recipient: request.fromAddress, // User receives the tokens
      deadline,
      amountIn: request.amountInRaw,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0,
    }]);

    return {
      to: chain.swapRouter02,
      data,
      value: request.sellToken === 'NATIVE' ? request.amountInRaw : 0n,
    };
  }

  /**
   * Calculate USDC amount received from the swap
   * This is a simplified version - in production you'd want to track actual token transfers
   */
  private async calculateUSDCReceived(
    request: GaslessSwapRequest, 
    receipt: ethers.TransactionReceipt, 
    provider: ethers.JsonRpcProvider
  ): Promise<bigint> {
    try {
      // For now, return a conservative estimate
      // In production, you'd parse the swap event logs to get exact amounts
      const chain = CHAINS.find(c => c.key === request.chainKey || this.chainKey);
      if (!chain) return 0n;

      // Get USDC contract
      const usdcContract = new ethers.Contract(chain.usdc, [
        'function balanceOf(address account) view returns (uint256)'
      ], provider);

      // Check balance before and after (this is simplified)
      // In reality, you'd need to track the exact swap amount from events
      return request.amountInRaw * 95n / 100n; // Assume 95% of input (5% slippage/fees)
    } catch (error) {
      console.warn('Could not calculate USDC received:', error);
      return 0n;
    }
  }

  /**
   * Get gas wallet address
   */
  getGasWalletAddress(): string {
    return this.gasWallet.address;
  }

  /**
   * Get gas wallet balance
   */
  async getGasWalletBalance(): Promise<bigint> {
    return await this.gasWalletProvider.getBalance(this.gasWallet.address);
  }

  /**
   * Check if gas wallet has sufficient balance for a transaction
   */
  async hasSufficientGasBalance(estimatedGas: bigint): Promise<boolean> {
    const balance = await this.getGasWalletBalance();
    const gasPrice = await this.gasWalletProvider.getFeeData();
    const maxFeePerGas = gasPrice.maxFeePerGas || gasPrice.gasPrice || ethers.parseUnits('20', 'gwei');
    const estimatedCost = estimatedGas * maxFeePerGas;
    
    return balance >= estimatedCost;
  }
}
