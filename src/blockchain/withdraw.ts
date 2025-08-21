import { ethers } from 'ethers';
import { CHAINS, getProvider, getFeeOverridesOrNull, TREASURY_PRIVATE_KEY, TREASURY_DERIVATION_INDEX } from './config';
import { getWalletForIndex } from './hd';
import { erc20Abi } from '../split/erc20Abi';

function resolveUSDC(chainKey?: string): string {
  const key = chainKey || CHAINS[0]?.key;
  const cfg = CHAINS.find(c => c.key === key);
  if (!cfg?.usdc) throw new Error(`USDC not configured for chain ${key}`);
  return cfg.usdc;
}

// amountUsd is in dollars; withdrawal sends that many USDC (6 decimals)
export async function sendWithdrawal(to: string, amountUsd: string | number, chainKey?: string) {
  const provider = getProvider(chainKey);
  if (!ethers.isAddress(to)) throw new Error('Invalid recipient address');

  // Parse USD to USDC 6-decimals
  const amountRaw = ethers.parseUnits(String(amountUsd), 6);

  // Load signer preference: private key first, fallback to HD wallet derivation
  let signer: ethers.Wallet | ethers.HDNodeWallet;
  if (TREASURY_PRIVATE_KEY) {
    signer = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  } else {
    signer = getWalletForIndex(TREASURY_DERIVATION_INDEX).connect(provider);
  }

  const usdcAddress = resolveUSDC(chainKey);
  const token = new ethers.Contract(usdcAddress, erc20Abi, signer);

  const feeOverrides = getFeeOverridesOrNull();
  const tx = await token.transfer(to, amountRaw, feeOverrides || {});
  return tx;
}


