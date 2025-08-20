// show-addresses.js - Display all user deposit addresses
require('dotenv').config();
const { AppDataSource } = require('./dist/utils/db');
const { User } = require('./dist/entities/User');

async function showAllAddresses() {
  try {
    // Initialize database
    await AppDataSource.initialize();
    console.log('📊 Database connected\n');

    // Get all users with deposit addresses
    const repo = AppDataSource.getRepository(User);
    const users = await repo.find({
      select: ['id', 'telegramId', 'username', 'depositAddress', 'balance']
    });

    console.log('👥 All Users and Their Deposit Addresses:');
    console.log('='.repeat(80));
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
    } else {
      for (const user of users) {
        console.log(`User ID: ${user.id} (HD Index: ${user.id})`);
        console.log(`Telegram ID: ${user.telegramId}`);
        console.log(`Username: ${user.username || 'N/A'}`);
        console.log(`Deposit Address: ${user.depositAddress || 'Not generated yet'}`);
        console.log(`HD Path: m/44'/60'/0'/0/${user.id}`);
        console.log(`Balance: ${user.balance} ETH`);
        console.log('-'.repeat(50));
      }
    }

    await AppDataSource.destroy();
    console.log('\n✅ Query completed');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

showAllAddresses();
