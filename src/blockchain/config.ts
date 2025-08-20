import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

let cachedProvider: ethers.JsonRpcProvider | null = null;
export function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.RPC_URL || '';
  if (!rpcUrl) throw new Error('RPC_URL is required');
  if (!cachedProvider) cachedProvider = new ethers.JsonRpcProvider(rpcUrl);
  return cachedProvider;
}

export const DERIVATION_PATH_PREFIX = process.env.DERIVATION_PATH_PREFIX || "m/44'/60'/0'/0";
export const HD_WALLET_MNEMONIC = process.env.HD_WALLET_MNEMONIC || '';
export const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '';
export const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY || '';
export const TREASURY_DERIVATION_INDEX = process.env.TREASURY_DERIVATION_INDEX
  ? Number(process.env.TREASURY_DERIVATION_INDEX)
  : 0;

export const MAX_FEE_GWEI = Number(process.env.MAX_FEE_GWEI || 0);
export const MAX_PRIORITY_FEE_GWEI = Number(process.env.MAX_PRIORITY_FEE_GWEI || 0);
export const MIN_SWEEP_WEI = BigInt(process.env.MIN_SWEEP_WEI || '0');
export const DEPOSIT_CONFIRMATIONS = Number(process.env.DEPOSIT_CONFIRMATIONS || 2);
export const WATCH_MODE = (process.env.WATCH_MODE || 'transactions').toLowerCase(); // 'transactions' | 'balances'
export const WATCHER_SYNC_MS = Number(process.env.WATCHER_SYNC_MS || 5000);

export function getFeeOverridesOrNull(): Partial<ethers.TransactionRequest> | null {
  if (MAX_FEE_GWEI > 0 && MAX_PRIORITY_FEE_GWEI > 0) {
    return {
      maxFeePerGas: ethers.parseUnits(String(MAX_FEE_GWEI), 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits(String(MAX_PRIORITY_FEE_GWEI), 'gwei'),
    };
  }
  return null;
}


