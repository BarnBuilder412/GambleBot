// src/manual-sweep.ts - Manual sweep tool for cleaning up dust
import * as dotenv from 'dotenv';
import { AppDataSource } from './utils/db';
import { User } from './entities/User';
import { getWalletForIndex } from './blockchain/hd';
import { sweepFromDerived } from './blockchain/sweeper';
import { getProvider } from './blockchain/config';
import { ethers } from 'ethers';

dotenv.config();

async function manualSweep() {
  try {
    // Initialize database
    await AppDataSource.initialize();
    console.log('📊 Database connected\n');

    // Get all users with deposit addresses
    const repo = AppDataSource.getRepository(User);
    const users = await repo.createQueryBuilder('user')
      .select(['user.id', 'user.telegramId', 'user.username', 'user.depositAddress'])
      .where('user.depositAddress IS NOT NULL')
      .getMany();

    if (users.length === 0) {
      console.log('❌ No users with deposit addresses found');
      return;
    }

    console.log(`🔍 Checking balances for ${users.length} addresses...\n`);

    const provider = getProvider();
    const addressesToSweep: { user: User; wallet: ethers.HDNodeWallet; balance: bigint }[] = [];

    // Check balances
    for (const user of users) {
      const balance = await provider.getBalance(user.depositAddress!);
      const balanceEth = ethers.formatEther(balance);
      
      console.log(`User ${user.id} (${user.username || user.telegramId}): ${balanceEth} ETH`);
      
      // Consider anything above 0.0001 ETH worth sweeping
      if (balance > ethers.parseEther('0.0001')) {
        const wallet = getWalletForIndex(user.id);
        addressesToSweep.push({ user, wallet, balance });
      }
    }

    if (addressesToSweep.length === 0) {
      console.log('\n✅ No addresses need sweeping (all below 0.0001 ETH)');
      return;
    }

    console.log(`\n🧹 Sweeping ${addressesToSweep.length} addresses with significant balances...\n`);

    // Perform sweep
    const wallets = addressesToSweep.map(item => item.wallet);
    const results = await sweepFromDerived(wallets);

    // Display results
    for (const result of results) {
      const userInfo = addressesToSweep.find(item => item.wallet.address.toLowerCase() === result.from.toLowerCase());
      const username = userInfo?.user.username || userInfo?.user.telegramId || 'Unknown';
      
      console.log(`${username}: ${result.status}`);
      if (result.txHash) console.log(`  TX: ${result.txHash}`);
      if (result.dustLeft) console.log(`  Dust left: ${result.dustLeft}`);
      if (result.reason) console.log(`  Reason: ${result.reason}`);
      console.log('');
    }

    await AppDataSource.destroy();
    console.log('✅ Manual sweep completed');

  } catch (error) {
    console.error('❌ Manual sweep failed:', error);
  }
}

manualSweep();
