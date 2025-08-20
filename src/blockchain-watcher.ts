// src/blockchain-watcher.ts - Standalone blockchain deposit watcher service
import * as dotenv from 'dotenv';
import { AppDataSource } from './utils/db';
import { blockchainService } from './services/BlockchainService';

dotenv.config();

async function startWatcher() {
  try {
    console.log('🔄 Starting Blockchain Watcher Service...');
    
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('📊 Database connection established');
    }
    
    // Load existing deposit addresses and start watching
    await blockchainService.loadExistingAddresses();
    blockchainService.startWatcher();
    
    console.log('✅ Blockchain Watcher Service is running!');
    console.log('💡 Press Ctrl+C to stop');
    
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
