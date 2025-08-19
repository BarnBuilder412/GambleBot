// cleanup-bonus.js
const { Client } = require('pg');
require('dotenv').config();

async function cleanupBonusTransactions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database');
    
    // Delete all bonus transactions
    const deleteResult = await client.query("DELETE FROM transaction WHERE type = 'bonus'");
    console.log(`🗑️  Deleted ${deleteResult.rowCount} bonus transactions`);
    
    // Reset any bonus balances to 0 (if column still exists)
    try {
      const updateResult = await client.query("UPDATE \"user\" SET \"bonusBalance\" = 0 WHERE \"bonusBalance\" > 0");
      console.log(`🔄 Reset ${updateResult.rowCount} user bonus balances`);
    } catch (e) {
      console.log('ℹ️  bonusBalance column already removed');
    }
    
    console.log('✅ Cleanup completed successfully');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanupBonusTransactions(); 