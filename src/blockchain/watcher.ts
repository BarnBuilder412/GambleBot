import { ethers } from 'ethers';
import { getProvider, DEPOSIT_CONFIRMATIONS, WATCH_MODE } from './config';

export type DepositEvent = {
  to: string;
  amountWei: bigint;
  txHash: string;
  blockNumber: number;
};

// Simple block-scanning watcher for EOAs; note: misses internal transfers unless using tracing RPC
export function watchDeposits(addressSet: Set<string>, onDeposit: (e: DepositEvent) => Promise<void> | void) {
  const provider = getProvider();
  const confLag = Math.max(DEPOSIT_CONFIRMATIONS - 1, 0);

  // Mode A: transaction scan (fast, misses internal transfers)
  async function onBlockTx(latestBlock: number) {
    const targetBlock = latestBlock - confLag;
    if (targetBlock < 0) return;
    const block = await provider.send('eth_getBlockByNumber', [ethers.toBeHex(targetBlock), true]);
    if (!block || !block.transactions) return;
    for (const tx of block.transactions as any[]) {
      const to = tx.to?.toLowerCase();
      if (to && addressSet.has(to)) {
        const value = tx.value ? BigInt(tx.value) : 0n;
        if (value > 0n) await onDeposit({ to: tx.to!, amountWei: value, txHash: tx.hash, blockNumber: Number(block.number) });
      }
    }
  }

  // Mode B: balance diff (slower, catches internal transfers)
  const lastBalance: Map<string, bigint> = new Map();
  async function onBlockBal(_latestBlock: number) {
    for (const lower of addressSet) {
      const bal = await provider.getBalance(lower);
      const prev = lastBalance.get(lower) ?? bal;
      if (bal > prev) {
        const delta = bal - prev;
        lastBalance.set(lower, bal);
        // Convert to checksum address for downstream DB lookups
        const checksum = ethers.getAddress(lower);
        await onDeposit({ to: checksum, amountWei: delta, txHash: 'internal/unknown', blockNumber: _latestBlock });
      } else if (!lastBalance.has(lower)) {
        lastBalance.set(lower, bal);
      }
    }
  }

  const handler = WATCH_MODE === 'balances' ? onBlockBal : onBlockTx;
  provider.on('block', handler);
  return () => provider.off('block', handler);
}


