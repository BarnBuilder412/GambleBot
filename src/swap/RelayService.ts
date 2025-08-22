// src/swap/RelayService.ts
import { ethers } from 'ethers';
import { CHAINS, getProvider } from '../blockchain/config';

export interface RelayRequest {
  from: string;
  to: string;
  data: string;
  value?: bigint;
  gas?: bigint;
  nonce?: number;
  deadline?: number;
  chainId?: number;
}

export interface RelayResult {
  success: boolean;
  txHash?: string;
  error?: string;
  gasUsed?: bigint;
  gasCost?: bigint;
}

export interface GaslessTransactionRequest {
  from: string;
  to: string;
  data: string;
  value?: bigint;
  gas?: bigint;
  nonce?: number;
  deadline?: number;
  chainId?: number;
  signature?: string;
}

export class RelayService {
  private gasWallet: ethers.Wallet;
  private gasWalletProvider: ethers.JsonRpcProvider;
  private chainId: number;

  constructor(
    private readonly gasWalletPrivateKey: string,
    chainKey: string = 'eth_sepolia'
  ) {
    const chain = CHAINS.find(c => c.key === chainKey);
    if (!chain) {
      throw new Error(`Chain configuration not found for: ${chainKey}`);
    }
    
    this.chainId = chain.chainId;
    const provider = getProvider(chainKey);
    this.gasWalletProvider = provider;
    this.gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);
  }

  /**
   * Execute a relayed transaction using the gas wallet
   */
  async relayTransaction(request: RelayRequest): Promise<RelayResult> {
    try {
      const provider = this.gasWalletProvider;
      const deadline = request.deadline || Math.floor(Date.now() / 1000) + 300; // 5 min default
      const nonce = request.nonce || await this.gasWallet.getNonce();

      // Check gas wallet balance
      const gasWalletBalance = await provider.getBalance(this.gasWallet.address);
      const estimatedGas = request.gas || await this.estimateGas(request, provider);
      const gasPrice = await provider.getFeeData();
      const maxFeePerGas = gasPrice.maxFeePerGas || gasPrice.gasPrice || ethers.parseUnits('20', 'gwei');
      const estimatedGasCost = estimatedGas * maxFeePerGas;

      if (gasWalletBalance < estimatedGasCost) {
        throw new Error(`Insufficient gas wallet balance. Required: ${ethers.formatEther(estimatedGasCost)} ETH, Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
      }

      // Create and send the transaction
      const txResponse = await this.gasWallet.sendTransaction({
        to: request.to,
        data: request.data,
        value: request.value || 0n,
        gasLimit: estimatedGas,
        maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas || ethers.parseUnits('1.5', 'gwei'),
        nonce,
      });

      console.log(`🔄 Relayed transaction sent: ${txResponse.hash}`);
      
      // Wait for confirmation
      const receipt = await txResponse.wait();
      
      if (receipt && receipt.status === 1) {
        return {
          success: true,
          txHash: receipt.hash,
          gasUsed: receipt.gasUsed,
          gasCost: receipt.gasUsed * maxFeePerGas,
        };
      } else {
        throw new Error('Transaction failed or receipt is null');
      }

    } catch (error) {
      console.error('❌ Relay transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a gasless transaction request that can be signed by the user
   * and then relayed by the gas wallet
   */
  async createGaslessTransactionRequest(request: RelayRequest): Promise<GaslessTransactionRequest> {
    const provider = this.gasWalletProvider;
    const deadline = request.deadline || Math.floor(Date.now() / 1000) + 300;
    const nonce = request.nonce || await this.gasWallet.getNonce();

    return {
      from: request.from,
      to: request.to,
      data: request.data,
      value: request.value || 0n,
      gas: request.gas || await this.estimateGas(request, provider),
      nonce,
      deadline,
      chainId: this.chainId,
    };
  }

  /**
   * Execute a gasless transaction that was signed by the user
   */
  async executeGaslessTransaction(
    signedRequest: GaslessTransactionRequest,
    userSignature: string
  ): Promise<RelayResult> {
    try {
      // Verify the signature
      const isValid = await this.verifySignature(signedRequest, userSignature);
      if (!isValid) {
        throw new Error('Invalid signature');
      }

      // Check if transaction is expired
      if (signedRequest.deadline && Date.now() / 1000 > signedRequest.deadline) {
        throw new Error('Transaction expired');
      }

      // Execute the relayed transaction
      return await this.relayTransaction({
        from: signedRequest.from,
        to: signedRequest.to,
        data: signedRequest.data,
        value: signedRequest.value,
        gas: signedRequest.gas,
        nonce: signedRequest.nonce,
        deadline: signedRequest.deadline,
        chainId: signedRequest.chainId,
      });

    } catch (error) {
      console.error('❌ Execute gasless transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Estimate gas for a transaction
   */
  private async estimateGas(request: RelayRequest, provider: ethers.JsonRpcProvider): Promise<bigint> {
    try {
      const estimatedGas = await provider.estimateGas({
        from: this.gasWallet.address,
        to: request.to,
        data: request.data,
        value: request.value || 0n,
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
   * Verify user signature for a gasless transaction
   */
  private async verifySignature(
    request: GaslessTransactionRequest,
    signature: string
  ): Promise<boolean> {
    try {
      // Create the message hash that should have been signed
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'address', 'bytes', 'uint256', 'uint256', 'uint256', 'uint256'],
          [
            request.from,
            request.to,
            request.data,
            request.value || 0n,
            request.gas || 0n,
            request.nonce || 0n,
            request.deadline || 0n,
          ]
        )
      );

      // Recover the signer address
      const recoveredAddress = ethers.verifyMessage(
        ethers.getBytes(messageHash),
        signature
      );

      // Check if the recovered address matches the from address
      return recoveredAddress.toLowerCase() === request.from.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
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

  /**
   * Get current gas prices
   */
  async getGasPrices(): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice?: bigint;
  }> {
    const gasPrice = await this.gasWalletProvider.getFeeData();
    return {
      maxFeePerGas: gasPrice.maxFeePerGas || gasPrice.gasPrice || ethers.parseUnits('20', 'gwei'),
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas || ethers.parseUnits('1.5', 'gwei'),
      gasPrice: gasPrice.gasPrice || undefined,
    };
  }
}
