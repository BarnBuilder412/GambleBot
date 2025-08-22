// src/blockchain-watcher.ts - Standalone blockchain deposit watcher service
import * as dotenv from 'dotenv';
import { AppDataSource } from './utils/db';
import { blockchainService } from './services/BlockchainService';
import { WATCHER_SYNC_MS, ENABLE_GASLESS_SWAPS, GAS_WALLET_PRIVATE_KEY } from './blockchain/config';
import { GaslessSwapService } from './swap/GaslessSwapService';

dotenv.config();

async function startWatcher() {
  try {
    console.log('🔄 Starting Blockchain Watcher Service...');
    
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('📊 Database connection established');
    }
    
    // Check gas wallet status if gasless swaps are enabled
    if (ENABLE_GASLESS_SWAPS && GAS_WALLET_PRIVATE_KEY) {
      try {
        const gaslessService = new GaslessSwapService(GAS_WALLET_PRIVATE_KEY);
        const gasWalletAddress = gaslessService.getGasWalletAddress();
        const gasWalletBalance = await gaslessService.getGasWalletBalance();
        
        console.log('🔑 Gas Wallet Status:');
        console.log(`   Address: ${gasWalletAddress}`);
        console.log(`   Balance: ${gasWalletBalance} wei`);
        
        if (gasWalletBalance === 0n) {
          console.log('⚠️  WARNING: Gas wallet has no balance! Gasless swaps will fail.');
        } else {
          console.log('✅ Gas wallet has sufficient balance for gasless swaps');
        }
      } catch (error) {
        console.warn('⚠️  Failed to check gas wallet status:', error);
      }
    } else {
      console.log('ℹ️  Gasless swaps not enabled');
    }
    
    // Load existing deposit addresses and start watching
    await blockchainService.loadExistingAddresses();
    blockchainService.startWatcher();
    
    console.log('✅ Blockchain Watcher Service is running!');
    console.log(`🔁 Syncing new addresses every ${WATCHER_SYNC_MS}ms`);
    console.log('💡 Press Ctrl+C to stop');

    // Periodically sync new addresses so new users are auto-watched
    setInterval(async () => {
      try {
        await blockchainService.syncNewAddresses();
      } catch (e) {
        console.error('❌ Address sync failed:', e);
      }
    }, WATCHER_SYNC_MS);
    
  } catch (error) {
    console.error('❌ Failed to start blockchain watcher:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down watcher...');
  blockchainService.stopWatcher();
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('📊 Database connection closed');
  }
  console.log('✅ Blockchain Watcher Service stopped');
  process.exit(0);
});

process.once('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down watcher...');
  blockchainService.stopWatcher();
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('📊 Database connection closed');
  }
  console.log('✅ Blockchain Watcher Service stopped');
  process.exit(0);
});

// Start the watcher
startWatcher();
