// fix-telegram-id.js
const { Client } = require('pg');
require('dotenv').config();

async function fixTelegramIdColumn() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database');
    
    // Check if the table exists and get current column info
    const tableCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user' AND column_name = 'telegramId'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('ℹ️  User table or telegramId column not found - will be created by TypeORM');
      return;
    }
    
    const currentType = tableCheck.rows[0].data_type;
    console.log(`📊 Current telegramId column type: ${currentType}`);
    
    if (currentType === 'bigint') {
      console.log('✅ Column is already bigint - no changes needed');
      return;
    }
    
    // Drop the unique index first
    console.log('🗑️  Dropping unique index...');
    await client.query('DROP INDEX IF EXISTS "IDX_telegramId"');
    await client.query('DROP INDEX IF EXISTS "IDX_user_telegramId"');
    
    // Change column type to bigint
    console.log('🔄 Converting telegramId column to bigint...');
    await client.query('ALTER TABLE "user" ALTER COLUMN "telegramId" TYPE bigint USING "telegramId"::bigint');
    
    // Recreate the unique index
    console.log('🔨 Recreating unique index...');
    await client.query('CREATE UNIQUE INDEX "IDX_user_telegramId" ON "user" ("telegramId")');
    
    console.log('✅ Successfully converted telegramId to bigint');
    
  } catch (error) {
    console.error('❌ Error during conversion:', error.message);
    
    // If it's a constraint error, try dropping constraints first
    if (error.message.includes('constraint') || error.message.includes('index')) {
      console.log('🔄 Attempting to fix constraint issues...');
      try {
        await client.query('ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "UQ_user_telegramId"');
        await client.query('ALTER TABLE "user" ALTER COLUMN "telegramId" TYPE bigint USING "telegramId"::bigint');
        await client.query('ALTER TABLE "user" ADD CONSTRAINT "UQ_user_telegramId" UNIQUE ("telegramId")');
        console.log('✅ Fixed with constraint recreation');
      } catch (e) {
        console.error('❌ Failed to fix constraints:', e.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

fixTelegramIdColumn(); 