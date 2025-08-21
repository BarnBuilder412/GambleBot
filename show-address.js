// show-address.js - Display address at specific HD index
require('dotenv').config();
const { ethers } = require('ethers');

function getAddressForIndex(userIndex) {
  const mnemonic = process.env.HD_WALLET_MNEMONIC;
  if (!mnemonic) {
    console.error('HD_WALLET_MNEMONIC not set in .env file');
    process.exit(1);
  }

  try {
    const derivationPath = `m/44'/60'/0'/0/${userIndex}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
    
    console.log(wallet.address);
    return wallet.address;
  } catch (error) {
    console.error(`Error deriving address for index ${userIndex}: ${error.message}`);
    process.exit(1);
  }
}

// Get index from command line argument
const index = process.argv[2];
if (!index) {
  console.log('Usage: node show-address.js <index>');
  console.log('Example: node show-address.js 0');
  console.log('Example: node show-address.js 1');
  process.exit(1);
}

const userIndex = parseInt(index);
if (isNaN(userIndex) || userIndex < 0) {
  console.error('❌ Invalid index. Please provide a non-negative number.');
  process.exit(1);
}

getAddressForIndex(userIndex);
