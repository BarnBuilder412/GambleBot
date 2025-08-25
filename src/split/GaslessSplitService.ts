// src/split/GaslessSplitService.ts
import { ethers } from 'ethers';
import { erc20Abi } from './erc20Abi';
import { getFeeOverridesOrNull, GAS_WALLET_PRIVATE_KEY, ENABLE_GASLESS_SWAPS, CHAINS } from '../blockchain/config';
import { RelayService } from '../swap/RelayService';

export type GaslessSplitResult = { 
  masterTx: string; 
  feeTx: string; 
  masterAmount: bigint; 
  feeAmount: bigint;
  gasCost: bigint;
  gasUsed: bigint;
};

/**
 * Gasless USDC split service that uses a gas wallet to pay for transfer fees
 * while transferring tokens from user's wallet to master and fee recipients
 */
export class GaslessSplitService {
  private gasWallet: ethers.Wallet;
  private relay: RelayService;

  constructor(
    private readonly gasWalletPrivateKey: string,
    private readonly provider: ethers.Provider
  ) {
    this.gasWallet = new ethers.Wallet(gasWalletPrivateKey, provider);
    this.relay = new RelayService(gasWalletPrivateKey);
  }

  /**
   * Execute gasless USDC split using meta-transaction pattern
   */
  async executeGaslessSplit(params: {
    usdc: string;
    fromAddress: string;          // User's address that holds the USDC
    fromPrivateKey: string;       // User's private key to sign transfers
    master: string;
    fee: string;
    amountRaw: bigint;            // 6 decimals
    bpsMaster: number;            // e.g., 9000
    bpsFee: number;               // e.g., 1000
    userSignature?: string;       // Optional: pre-signed permission
  }): Promise<GaslessSplitResult> {
    const masterAmount = (params.amountRaw * BigInt(params.bpsMaster)) / 10000n;
    const feeAmount = params.amountRaw - masterAmount;

    // Validate balance
    const tokenRead = new ethers.Contract(params.usdc, erc20Abi, this.provider);
    const userBalance: bigint = await (tokenRead as any).balanceOf(params.fromAddress);
    if (userBalance < params.amountRaw) {
      throw new Error(`Insufficient USDC balance. Required: ${ethers.formatUnits(params.amountRaw, 6)} USDC, Available: ${ethers.formatUnits(userBalance, 6)} USDC`);
    }

    // Build EIP-3009 transferWithAuthorization payloads
    const network = await (this.provider as any).getNetwork();
    const chainId = Number(network.chainId);
    const data1 = await this.buildTransferWithAuthorizationData({
      token: params.usdc,
      chainId,
      from: params.fromAddress,
      fromPrivateKey: params.fromPrivateKey,
      to: params.master,
      value: masterAmount,
    });
    const data2 = await this.buildTransferWithAuthorizationData({
      token: params.usdc,
      chainId,
      from: params.fromAddress,
      fromPrivateKey: params.fromPrivateKey,
      to: params.fee,
      value: feeAmount,
    });

    // Relay both calls from gas wallet
    const r1 = await this.relay.relayTransaction({ from: this.gasWallet.address, to: params.usdc, data: data1 });
    if (!r1.success) throw new Error(`Relay master transfer failed: ${r1.error}`);
    const r2 = await this.relay.relayTransaction({ from: this.gasWallet.address, to: params.usdc, data: data2 });
    if (!r2.success) throw new Error(`Relay fee transfer failed: ${r2.error}`);

    return {
      masterTx: r1.txHash || '',
      feeTx: r2.txHash || '',
      masterAmount,
      feeAmount,
      gasUsed: (r1.gasUsed || 0n) + (r2.gasUsed || 0n),
      gasCost: (r1.gasCost || 0n) + (r2.gasCost || 0n),
    };
  }

  /**
   * Execute gasless split using relay pattern (user doesn't need gas at all)
   */
  async executeRelaySplit(params: {
    usdc: string;
    fromAddress: string;
    master: string;
    fee: string;
    amountRaw: bigint;
    bpsMaster: number;
    bpsFee: number;
    userSignatures: {
      masterSignature: string;    // User's signature to authorize master transfer
      feeSignature: string;       // User's signature to authorize fee transfer
    };
  }): Promise<GaslessSplitResult> {
    // For relay pattern, we'd need EIP-2612 permit or EIP-712 meta-transactions
    // This would require the USDC contract to support permit() function
    // For now, this is a placeholder for future implementation
    
    throw new Error('Relay split not yet implemented - requires EIP-2612 permit support');
  }

  /**
   * Get gas wallet address
   */
  getGasWalletAddress(): string {
    return this.gasWallet.address;
  }

  // Removed contract-based split path; all splits use relayer-only flow

  /**
   * Check if gas wallet has sufficient balance for split operations
   */
  async hasSufficientGasBalance(): Promise<boolean> {
    const balance = await this.provider.getBalance(this.gasWallet.address);
    const gasPrice = await this.provider.getFeeData();
    const maxFeePerGas = gasPrice.maxFeePerGas || gasPrice.gasPrice || ethers.parseUnits('10', 'gwei');
    const estimatedCost = 100000n * maxFeePerGas; // Conservative estimate
    
    return balance >= estimatedCost;
  }

  private async buildTransferWithAuthorizationData(args: {
    token: string;
    chainId: number;
    from: string;
    fromPrivateKey: string;
    to: string;
    value: bigint;
  }): Promise<string> {
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    // Resolve EIP-712 domain name/version from token contract
    const metaIface = new ethers.Interface([
      'function name() view returns (string)',
      'function version() view returns (string)'
    ]);
    const tokenRead = new ethers.Contract(args.token, metaIface, this.provider);
    let domainName = 'USD Coin';
    let domainVersion = '2';
    try { domainName = await tokenRead.name(); } catch {}
    try { domainVersion = await (tokenRead as any).version(); } catch {}

    const domain = {
      name: domainName,
      version: domainVersion,
      chainId: args.chainId,
      verifyingContract: args.token,
    } as any;

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    } as const;

    const message = {
      from: args.from,
      to: args.to,
      value: args.value,
      validAfter,
      validBefore,
      nonce,
    } as any;

    const wallet = new ethers.Wallet(args.fromPrivateKey);
    const signature = await wallet.signTypedData(domain, types as any, message);
    const sig = ethers.Signature.from(signature);

    const iface = new ethers.Interface([
      'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external',
    ]);
    return iface.encodeFunctionData('transferWithAuthorization', [
      args.from,
      args.to,
      args.value,
      validAfter,
      validBefore,
      nonce,
      sig.v,
      sig.r,
      sig.s,
    ]);
  }
}

/**
 * Enhanced split function that tries gasless first, falls back to regular split
 */
export async function splitUsdcGasless(params: {
  provider: ethers.Provider;
  usdc: string;
  fromSigner: ethers.Signer;
  master: string;
  fee: string;
  amountRaw: bigint;
  bpsMaster: number;
  bpsFee: number;
  devMode?: boolean;
  preferGasless?: boolean;
  chainKey?: string;
}): Promise<GaslessSplitResult> {
  const masterAmount = (params.amountRaw * BigInt(params.bpsMaster)) / 10000n;
  const feeAmount = params.amountRaw - masterAmount;

  if (params.devMode) {
    return { 
      masterTx: 'gasless-dev-master', 
      feeTx: 'gasless-dev-fee', 
      masterAmount, 
      feeAmount,
      gasUsed: 0n,
      gasCost: 0n
    };
  }

  // Try gasless split via relayer only (no contract interactions)
  if (params.preferGasless && ENABLE_GASLESS_SWAPS && GAS_WALLET_PRIVATE_KEY) {
    try {
      const gaslessSplitService = new GaslessSplitService(GAS_WALLET_PRIVATE_KEY, params.provider);
      
      // Check if we have sufficient gas balance
      const hasSufficientGas = await gaslessSplitService.hasSufficientGasBalance();
      if (!hasSufficientGas) {
        console.warn('[gasless-split] Insufficient gas wallet balance, falling back to regular split');
        throw new Error('Insufficient gas wallet balance');
      }

      console.log('[gasless-split] Attempting gasless USDC split');
      const fromAddress = await params.fromSigner.getAddress();
      
      // Get private key from signer (this assumes ethers.Wallet)
      let fromPrivateKey: string;
      if ('privateKey' in params.fromSigner) {
        fromPrivateKey = (params.fromSigner as any).privateKey;
      } else {
        throw new Error('Cannot extract private key from signer for gasless split');
      }

      const result = await gaslessSplitService.executeGaslessSplit({
        usdc: params.usdc,
        fromAddress,
        fromPrivateKey,
        master: params.master,
        fee: params.fee,
        amountRaw: params.amountRaw,
        bpsMaster: params.bpsMaster,
        bpsFee: params.bpsFee,
      });

      console.log('[gasless-split] Gasless split successful');
      return result;

    } catch (error) {
      console.warn(`[gasless-split] Gasless split failed: ${error}. No fallback to manual split to avoid funding user.`);
      throw error;
    }
  }
  // If we reached here, splitting is not possible without funding the user or permit support.
  throw new Error('USDC gasless split not supported for direct deposits without meta-tx/permit.');
}
