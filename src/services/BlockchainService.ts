import { AppDataSource } from '../utils/db';
import { User } from '../entities/User';
import { Transaction, TransactionType } from '../entities/Transaction';
import { getAddressForIndex, getWalletForIndex } from '../blockchain/hd';
import { sweepFromDerived } from '../blockchain/sweeper';
import { watchDeposits } from '../blockchain/watcher';

export class BlockchainService {
  private watchedAddresses = new Set<string>();
  private stopFn: (() => void) | null = null;
  private processedTxHashes = new Set<string>(); // Prevent duplicate processing
  private lastSyncedCount = 0;

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
    if (this.stopFn) return; // already running
    
    this.stopFn = watchDeposits(this.watchedAddresses, async (evt) => {
      try {
        // Prevent duplicate processing of the same transaction
        if (this.processedTxHashes.has(evt.txHash)) {
          console.log(`⚠️ Transaction ${evt.txHash} already processed, skipping`);
          return;
        }
        this.processedTxHashes.add(evt.txHash);

        console.log(`💰 Deposit detected: ${evt.amountWei} wei to ${evt.to} (tx: ${evt.txHash})`);

        // Find user by deposit address (case-insensitive)
        const repo = AppDataSource.getRepository(User);
        const user = await repo.createQueryBuilder('user')
          .where('LOWER(user.depositAddress) = LOWER(:address)', { address: evt.to })
          .getOne();
        
        if (!user) {
          console.error(`❌ No user found for deposit address ${evt.to} (ensure address saved in checksum form)`);
          return;
        }

        // Convert wei to ETH with precision
        const amountEth = Number(evt.amountWei) / 1e18;
        const oldBalance = user.balance;

        // Use database transaction to ensure atomicity
        await AppDataSource.transaction(async (manager) => {
          // Create transaction record
          const tx = new Transaction();
          tx.user = user;
          tx.amount = amountEth;
          tx.type = TransactionType.DEPOSIT;
          tx.description = `Deposit ${evt.txHash} (Block: ${evt.blockNumber})`;
          
          // Update user balance
          user.balance += amountEth;
          
          // Save both in single transaction
          await manager.save([user, tx]);
        });

        console.log(`✅ Balance updated for user ${user.id} (Telegram: ${user.telegramId})`);
        console.log(`   Old balance: ${oldBalance.toFixed(6)} ETH`);
        console.log(`   Deposit: +${amountEth.toFixed(6)} ETH`);
        console.log(`   New balance: ${user.balance.toFixed(6)} ETH`);

        // Trigger immediate sweep for this user (fire-and-forget)
        const signer = getWalletForIndex(user.id);
        sweepFromDerived([signer as any]).catch((error) => {
          console.error(`❌ Sweep failed for user ${user.id}:`, error.message);
        });

      } catch (error) {
        console.error(`❌ Error processing deposit ${evt.txHash}:`, error);
      }
    });
    
    console.log(`🔄 Blockchain watcher started, monitoring deposits...`);
  }

  stopWatcher() {
    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }
  }
}

// Export a singleton instance so all parts of the app share the same watcher state
export const blockchainService = new BlockchainService();


