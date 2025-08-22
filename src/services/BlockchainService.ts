import { AppDataSource } from '../utils/db';
import { User } from '../entities/User';
import { Transaction, TransactionType } from '../entities/Transaction';
import { getAddressForIndex, getWalletForIndex } from '../blockchain/hd';
import { watchDeposits } from '../blockchain/watcher';
import { makeProcessor } from '../pipeline/processor';
import { SwapService, UniswapV3Router02Adapter, UniswapV2PairDirectAdapter } from '../swap/SwapService';
import { CHAINS } from '../blockchain/config';

export class BlockchainService {
  private watchedAddresses = new Set<string>();
  private stopFns: Array<() => void> = [];
  private processedTxHashes = new Set<string>(); // Prevent duplicate processing (per chain)
  private lastSyncedCount = 0;
  private processor = makeProcessor({ swap: new SwapService([
    new UniswapV2PairDirectAdapter(), // try direct V2 pair first if available
    new UniswapV3Router02Adapter(),   // fallback to V3 router
  ], 'eth_sepolia') });

  async ensureDepositAddress(user: User): Promise<string> {
    if (user.depositAddress) {
      // Address already exists, make sure it's being watched
      this.watchAddress(user.depositAddress);
      return user.depositAddress;
    }
    
    // Use user.id as deterministic index
    const address = getAddressForIndex(user.id);
    user.depositAddress = address;
    await AppDataSource.manager.save(user);
    this.watchAddress(address);
    console.log(`🔑 Generated deposit address for user ${user.id}: ${address}`);
    return address;
  }

  watchAddress(address: string) {
    this.watchedAddresses.add(address.toLowerCase());
  }

  async loadExistingAddresses() {
    // Load all existing deposit addresses into the watcher on startup
    const repo = AppDataSource.getRepository(User);
    const usersWithAddresses = await repo.createQueryBuilder('user')
      .select(['user.depositAddress'])
      .where('user.depositAddress IS NOT NULL')
      .getMany();
    
    for (const user of usersWithAddresses) {
      if (user.depositAddress) {
        this.watchAddress(user.depositAddress);
      }
    }
    
    this.lastSyncedCount = this.watchedAddresses.size;
    console.log(`📡 Watching ${this.watchedAddresses.size} deposit addresses for incoming transactions`);
  }

  async syncNewAddresses() {
    // Pull any new addresses added since last sync
    const repo = AppDataSource.getRepository(User);
    const usersWithAddresses = await repo.createQueryBuilder('user')
      .select(['user.depositAddress'])
      .where('user.depositAddress IS NOT NULL')
      .getMany();

    let added = 0;
    for (const user of usersWithAddresses) {
      if (user.depositAddress && !this.watchedAddresses.has(user.depositAddress.toLowerCase())) {
        this.watchAddress(user.depositAddress);
        added++;
      }
    }
    if (added > 0) {
      console.log(`🆕 Added ${added} new deposit addresses to watcher (total: ${this.watchedAddresses.size})`);
    }
  }

  startWatcher() {
    if (this.stopFns.length) return; // already running
    
    const handler = async (evt: any, chainKey?: string) => {
      try {
        console.log(`[watcher] ➜ Deposit event on ${chainKey}:`, evt);
        // Prevent duplicate processing of the same transaction
        const id = `${chainKey || 'default'}:${evt.txHash}`;
        if (this.processedTxHashes.has(id)) {
          console.log(`⚠️ Transaction ${evt.txHash} already processed, skipping`);
          return;
        }
        this.processedTxHashes.add(id);

        console.log(`💰 Deposit detected: ${evt.amountWei} wei to ${evt.to} (tx: ${evt.txHash})`);

        // Find user by deposit address (case-insensitive)
        const repo = AppDataSource.getRepository(User);
        console.log(`[watcher] Looking up user by deposit address: ${evt.to}`);
        const user = await repo.createQueryBuilder('user')
          .where('LOWER(user.depositAddress) = LOWER(:address)', { address: evt.to })
          .getOne();
        
        if (!user) {
          console.error(`❌ No user found for deposit address ${evt.to} (ensure address saved in checksum form)`);
          return;
        }
        console.log(`[watcher] Matched user ${user.id} for deposit ${evt.txHash}`);

        // Enqueue swap job -> split -> DB credit in USD via USDC
        const deposit = {
          id: String(user.id),
          chainKey: chainKey,
          to: evt.to,
          token: 'NATIVE' as const,
          amountRaw: evt.amountWei,
          txHash: evt.txHash,
          logIndex: 0,
        };
        console.log(`[watcher] Enqueue swap job:`, deposit);
        this.processor.queue.enqueue({ kind: 'swap', deposit });

      } catch (error) {
        console.error(`❌ Error processing deposit ${evt.txHash}:`, error);
      }
    };

    // Start one watcher per configured chain
    for (const cfg of CHAINS) {
      console.log(`[watcher] Subscribing to chain ${cfg.key} with confirmations=${cfg.confirmations} mode=${cfg.watchMode}`);
      const stop = watchDeposits(this.watchedAddresses, (evt) => handler(evt, cfg.key), cfg.key);
      this.stopFns.push(stop);
    }
    
    console.log(`🔄 Blockchain watcher started, monitoring deposits...`);
  }

  stopWatcher() {
    for (const s of this.stopFns) s();
    this.stopFns = [];
  }
}

// Export a singleton instance so all parts of the app share the same watcher state
export const blockchainService = new BlockchainService();


