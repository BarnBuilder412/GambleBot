import { ethers } from 'ethers';
import { getProvider, TREASURY_ADDRESS, getFeeOverridesOrNull, MIN_SWEEP_WEI } from './config';

export async function sweepFromDerived(wallets: ethers.Wallet[], destination?: string) {
  const provider = getProvider();
  const to = destination || TREASURY_ADDRESS;
  if (!to) throw new Error('Destination address or TREASURY_ADDRESS is required');

  const feeOverrides = getFeeOverridesOrNull();
  const results: Array<{ from: string; status: string; txHash?: string; reason?: string }> = [];

  for (const w of wallets) {
    const signer = w.connect(provider);
    const from = await signer.getAddress();
    const bal = await provider.getBalance(from);
    if (bal < MIN_SWEEP_WEI || bal === 0n) {
      results.push({ from, status: 'skipped', reason: 'below min threshold' });
      continue;
    }
    let tx: ethers.TransactionResponse;
    const estGas = 21000n;
    if (feeOverrides && feeOverrides.maxFeePerGas) {
      const transferable = bal > (feeOverrides.maxFeePerGas as bigint) * estGas ? bal - (feeOverrides.maxFeePerGas as bigint) * estGas : 0n;
      tx = await signer.sendTransaction({ to, value: transferable, ...feeOverrides });
    } else {
      const fd = await provider.getFeeData();
      const maxFeePerGas = fd.maxFeePerGas ?? 0n;
      const maxPriorityFeePerGas = fd.maxPriorityFeePerGas ?? 0n;
      const transferable = bal > maxFeePerGas * estGas ? bal - maxFeePerGas * estGas : 0n;
      tx = await signer.sendTransaction({ to, value: transferable, maxFeePerGas, maxPriorityFeePerGas });
    }
    results.push({ from, status: 'submitted', txHash: tx.hash });
  }
  return results;
}


