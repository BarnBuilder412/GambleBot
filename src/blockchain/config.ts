import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

// ---- Multichain config ----
export type ChainConfig = {
  key: string;
  chainId: number;
  rpcUrl: string;
  confirmations: number;
  usdc: string;
  watchMode: 'transactions' | 'balances';
  // DEX specifics (optional, per chain)
  swapRouter02?: string; // Uniswap V3 SwapRouter02
  weth?: string;         // WETH9 address for native swaps
  uniswapV3Factory?: string; // Uniswap V3 Factory
  uniswapV2Factory?: string; // Uniswap V2 Factory (for direct pair swaps)
};

const providers: Map<string, ethers.JsonRpcProvider> = new Map();

function buildChainConfigs(): ChainConfig[] {
  const apiKey = process.env.RPC_API_KEY || '';
  if (!apiKey) throw new Error('RPC_API_KEY (Alchemy) is required');

  return [
    // {
    //   key: 'eth_mainnet',
    //   chainId: 1,
    //   rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`,
    //   confirmations: 6,
    //   usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    //   watchMode: 'transactions',
    // },
    {
      key: 'eth_sepolia',
      chainId: 11155111,
      rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${apiKey}`,
      confirmations: 2,
      usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
      watchMode: 'transactions',
      swapRouter02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH9
      uniswapV3Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c', // Uniswap V3 Factory
      uniswapV2Factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    }, 
    // {
    //   key: 'polygon_mainnet',
    //   chainId: 137,
    //   rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`,
    //   confirmations: 100,
    //   usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    //   watchMode: 'transactions',
    // },
    // {
    //   key: 'polygon_amoy',
    //   chainId: 80002,
    //   rpcUrl: `https://polygon-amoy.g.alchemy.com/v2/${apiKey}`,
    //   confirmations: 50,
    //   usdc: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582', // Amoy testnet USDC
    //   watchMode: 'transactions',
    // },
    // {
    //   key: 'arbitrum_mainnet',
    //   chainId: 42161,
    //   rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${apiKey}`,
    //   confirmations: 10,
    //   usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    //   watchMode: 'transactions',
    // },
    // {
    //   key: 'arbitrum_sepolia',
    //   chainId: 421614,
    //   rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${apiKey}`,
    //   confirmations: 5,
    //   usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Arbitrum Sepolia USDC
    //   watchMode: 'transactions',
    // },
  ];
}

export const CHAINS: ChainConfig[] = buildChainConfigs();

export function getProvider(chainKey?: string): ethers.JsonRpcProvider {
  const key = chainKey || CHAINS[0]?.key || 'eth_sepolia';
  const cfg = CHAINS.find((c) => c.key === key);
  if (!cfg) throw new Error(`Chain configuration not found for: ${key}`);
  if (!providers.has(cfg.key)) providers.set(cfg.key, new ethers.JsonRpcProvider(cfg.rpcUrl));
  return providers.get(cfg.key)!;
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

// Split configuration
export const FEE_WALLET = process.env.FEE_WALLET || '';
export const FEE_BPS = Number(process.env.FEE_BPS || 1000); // 10% = 1000 basis points
export const MASTER_BPS = 10000 - FEE_BPS;

export function getFeeOverridesOrNull(): Partial<ethers.TransactionRequest> | null {
  if (MAX_FEE_GWEI > 0 && MAX_PRIORITY_FEE_GWEI > 0) {
    return {
      maxFeePerGas: ethers.parseUnits(String(MAX_FEE_GWEI), 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits(String(MAX_PRIORITY_FEE_GWEI), 'gwei'),
    };
  }
  return null;
}


