// test-deposit.js - Simple test script to verify deposit balance updates
require('dotenv').config();
const { AppDataSource } = require('./dist/utils/db');
const { User } = require('./dist/entities/User');
const { Transaction } = require('./dist/entities/Transaction');

async function testDepositBalanceUpdate() {
  try {
    // Initialize database
    await AppDataSource.initialize();
    console.log('📊 Database connected');

    // Find a test user or create one
    const repo = AppDataSource.getRepository(User);
    let testUser = await repo.findOne({ where: { telegramId: 123456789 } });
    
    if (!testUser) {
      testUser = new User();
      testUser.telegramId = 123456789;
      testUser.username = 'testuser';
      testUser.balance = 0;
      testUser.depositAddress = '0x742d35Cc6634C0532925a3b8D4C2E8e4C7';
      await repo.save(testUser);
      console.log('👤 Created test user');
    }

    console.log(`\n📊 User ${testUser.telegramId} current state:`);
    console.log(`   ID: ${testUser.id}`);
    console.log(`   Balance: ${testUser.balance} ETH`);
    console.log(`   Deposit Address: ${testUser.depositAddress}`);

    // Get transaction history
    const transactions = await AppDataSource.getRepository(Transaction)
      .find({
        where: { user: { id: testUser.id } },
        order: { createdAt: 'DESC' },
        take: 5
      });

    console.log(`\n📝 Recent transactions (${transactions.length}):`);
    for (const tx of transactions) {
      console.log(`   ${tx.type}: ${tx.amount > 0 ? '+' : ''}${tx.amount} ETH - ${tx.description} (${tx.createdAt.toISOString()})`);
    }

    await AppDataSource.destroy();
    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDepositBalanceUpdate();
