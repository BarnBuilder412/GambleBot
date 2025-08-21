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

  // Parse USD to USDC 6-decimals (truncate beyond 6 decimals)
  const amountNum = Number(amountUsd);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error(`Invalid withdrawal amount: ${amountUsd}`);
  }
  const amountRaw: bigint = BigInt(Math.floor(amountNum * 1e6));
  if (amountRaw <= 0n) {
    throw new Error('Withdrawal amount too small (min 0.000001 USDC)');
  }

  // Load signer preference: private key first, fallback to HD wallet derivation
  let signer: ethers.Wallet | ethers.HDNodeWallet;
  if (TREASURY_PRIVATE_KEY) {
    signer = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  } else {
    signer = getWalletForIndex(TREASURY_DERIVATION_INDEX).connect(provider);
  }

  const signerAddress = await signer.getAddress();
  const usdcAddress = resolveUSDC(chainKey);
  const token = new ethers.Contract(usdcAddress, erc20Abi, signer);

  // Debug logs
  console.log(`[withdraw] Preparing USDC withdrawal`);
  console.log(`[withdraw] chainKey=${chainKey || CHAINS[0]?.key} to=${to} usdc=${usdcAddress}`);
  console.log(`[withdraw] signer=${signerAddress} amountUsd=${amountNum} amountRaw(6d)=${amountRaw}`);

  // Check signer USDC balance before sending
  try {
    const signerBal: bigint = await token.balanceOf(signerAddress);
    console.log(`[withdraw] signer USDC balance=${signerBal}`);
    if (signerBal < amountRaw) {
      const have = Number(signerBal) / 1e6;
      const want = Number(amountRaw) / 1e6;
      const msg = `Treasury USDC balance insufficient. Have $${have.toFixed(6)} need $${want.toFixed(6)}`;
      console.error(`[withdraw] ${msg}`);
      throw new Error(msg);
    }
  } catch (e: any) {
    console.error(`[withdraw] Failed reading USDC balance: ${e?.message || e}`);
    throw e;
  }

  // Send token transfer
  try {
    const feeOverrides = getFeeOverridesOrNull();
    const tx = await token.transfer(to, amountRaw, feeOverrides || {});
    console.log(`[withdraw] Sent transfer tx=${tx.hash}`);
    return tx;
  } catch (e: any) {
    console.error(`[withdraw] Transfer failed: ${e?.message || e}`);
    throw e;
  }
}


