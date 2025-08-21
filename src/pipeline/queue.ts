export type DepositRef = {
  id: string;             // using user.id for signer derivation in this codebase
  chainKey?: string;      // future use for multichain signer/provider
  to: string;
  token: 'NATIVE' | string;
  amountRaw: bigint;
  txHash: string;
  logIndex?: number;
};

export type SwapJob = { kind: 'swap'; deposit: DepositRef };
export type SplitJob = { kind: 'split'; depositId: string; usdcAmountRaw: bigint; chainKey?: string };
type Job = SwapJob | SplitJob;

export class InProcessQueue {
  private q: Job[] = [];
  private running = 0;
  constructor(private readonly concurrency = 2, private readonly handler: (j: Job) => Promise<void>) {}
  enqueue(job: Job) { this.q.push(job); this.pump(); }
  private async pump() {
    while (this.running < this.concurrency && this.q.length) {
      const j = this.q.shift()!;
      this.running++;
      const start = Date.now();
      const id = (j as any).kind === 'swap'
        ? `${(j as any).deposit?.txHash}:${(j as any).deposit?.logIndex ?? 0}`
        : (j as any).depositId || 'n/a';
      console.log(`[queue] ➜ Start job kind=${(j as any).kind} id=${id}. Running=${this.running}/${this.concurrency}. QueueLen=${this.q.length}`);
      this.handler(j).then(() => {
        const ms = Date.now() - start;
        console.log(`[queue] ✓ Done job kind=${(j as any).kind} id=${id} in ${ms}ms`);
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        const ms = Date.now() - start;
        console.error(`[queue] ✗ Failed job kind=${(j as any).kind} id=${id} after ${ms}ms: ${msg}`);
        console.error(`[queue] Job detail:`, j);
      }).finally(() => { this.running--; this.pump(); });
    }
  }
}


