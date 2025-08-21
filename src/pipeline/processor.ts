import { InProcessQueue, SwapJob, SplitJob } from './queue';
import { SwapService } from '../swap/SwapService';
import { splitUsdc } from '../split/SplitService';
import { AppDataSource } from '../utils/db';
import { Transaction, TransactionType } from '../entities/Transaction';
import { User } from '../entities/User';
import { getWalletForIndex } from '../blockchain/hd';
import { ethers } from 'ethers';
import { CHAINS, FEE_WALLET, FEE_BPS, MASTER_BPS, TREASURY_ADDRESS, getProvider } from '../blockchain/config';
import { erc20Abi } from '../split/erc20Abi';

export function makeProcessor(deps: { swap: SwapService }) {
  const processed = new Set<string>();
  const queue = new InProcessQueue(2, async (job) => {
    if ((job as SwapJob).kind === 'swap') {
      const swap = job as SwapJob;
      const id = `${swap.deposit.txHash}:${swap.deposit.logIndex ?? 0}`;
      if (processed.has(id)) return;
      processed.add(id);

      // 1) Swap to USDC
      const signer = getWalletForIndex(Number(swap.deposit.id));
      const provider = getProvider(swap.deposit.chainKey);
      // Track USDC balance change to compute realized amount when needed
      const usdcAddress = resolveUSDC(swap.deposit.chainKey);
      console.log(`[pipeline] Starting swap for deposit ${id} on ${swap.deposit.chainKey} -> USDC ${usdcAddress}`);
      console.log(`[pipeline] Swap params: from=${signer.address} token=${swap.deposit.token} amountInRaw=${swap.deposit.amountRaw}`);
      const usdcRead = new ethers.Contract(usdcAddress, erc20Abi, provider);
      const beforeBal: bigint = await usdcRead.balanceOf(signer.address);

      const res = await deps.swap.swapToUSDC({
        chainKey: swap.deposit.chainKey,
        fromAddress: signer.address,
        token: swap.deposit.token,
        amountRaw: swap.deposit.amountRaw,
        slippageBps: 50,
        usdcAddress: usdcAddress,
      });

      // If adapter returned approvals, send them first
      if ((res as any).approvals && (res as any).approvals.length) {
        const wallet = new ethers.Wallet((signer as any).privateKey, provider);
        for (const appr of (res as any).approvals as any[]) {
          const txa = await wallet.sendTransaction(appr);
          await txa.wait();
          console.log(`[pipeline] Approval tx: ${txa.hash}`);
        }
      }

      // If adapter returned txRequests (multi-step) or a single txRequest, send them sequentially
      let swapTxHash = res.txHash;
      const wallet = new ethers.Wallet((signer as any).privateKey, provider);
      const txRequests: ethers.TransactionRequest[] = Array.isArray((res as any).txRequests)
        ? (res as any).txRequests
        : (res as any).txRequest
        ? [ (res as any).txRequest ]
        : [];
      for (const [idx, treq] of txRequests.entries()) {
        console.log(`[pipeline] Sending swap step ${idx+1}/${txRequests.length}:`, treq);
        const sent = await wallet.sendTransaction(treq);
        await sent.wait();
        swapTxHash = sent.hash;
        console.log(`[pipeline] Swap step ${idx+1}/${txRequests.length} tx: ${sent.hash}`);
      }

      // Determine realized USDC out: prefer adapter's value, else balance diff
      let usdcOut: bigint = res.usdcAmountRaw;
      if (usdcOut === 0n) {
        const afterBal: bigint = await usdcRead.balanceOf(signer.address);
        usdcOut = afterBal > beforeBal ? (afterBal - beforeBal) : 0n;
      }
      console.log(`[pipeline] Realized USDC out: ${usdcOut}`);

      // 2) Split USDC based on FEE_BPS
      console.log(`[pipeline] Splitting USDC: amount=${usdcOut} master=${resolveMaster(swap.deposit.chainKey)} fee=${resolveFee(swap.deposit.chainKey)} bpsMaster=${MASTER_BPS} bpsFee=${FEE_BPS}`);
      const split = await splitUsdc({
        provider,
        usdc: usdcAddress,
        fromSigner: new ethers.Wallet(signer.privateKey),
        master: resolveMaster(swap.deposit.chainKey),
        fee: resolveFee(swap.deposit.chainKey),
        amountRaw: usdcOut,
        bpsMaster: MASTER_BPS,
        bpsFee: FEE_BPS,
      });
      console.log(`[pipeline] Split master=${split.masterAmount} fee=${split.feeAmount}`);

      // 3) Update DB with USDC credited to master
      const masterUsdc = Number(split.masterAmount) / 1e6; // USDC 6 decimals
      await AppDataSource.transaction(async (m) => {
        const userRepo = m.getRepository(User);
        const txRepo = m.getRepository(Transaction);
        const user = await userRepo.createQueryBuilder('user')
          .where('LOWER(user.depositAddress) = LOWER(:address)', { address: swap.deposit.to })
          .getOne();
        if (!user) return;

        user.balance += masterUsdc;
        const tx = new Transaction();
        tx.user = user;
        tx.amount = masterUsdc;
        tx.type = TransactionType.DEPOSIT;
        tx.description = `Deposit settled to USDC. Swap:${swapTxHash || res.txHash} Master:${split.masterTx} Fee:${split.feeTx}`;

        await m.save([user, tx]);
      });
      console.log(`[pipeline] Deposit settled. Credited ${masterUsdc} USDC to user.`);

    } else if ((job as SplitJob).kind === 'split') {
      // not used in this minimal flow; splitting is done immediately after swap
      return;
    }
  });

  return { queue };
}

function resolveUSDC(chainKey?: string) {
  const cfg = CHAINS.find(c => c.key === chainKey);
  if (!cfg) throw new Error(`Chain config not found for: ${chainKey}`);
  return cfg.usdc;
}
function resolveMaster(chainKey?: string) {
  return TREASURY_ADDRESS; // Use global treasury as master wallet
}
function resolveFee(chainKey?: string) {
  return FEE_WALLET; // Use global fee wallet
}


