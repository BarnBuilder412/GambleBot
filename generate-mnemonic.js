// generate-mnemonic.js - Create a new BIP-39 mnemonic and show first address
require('dotenv').config();
const bip39 = require('bip39');
const { ethers } = require('ethers');

(async () => {
  try {
    const strength = 256; // 24 words
    const mnemonic = await bip39.generateMnemonic(strength);
    console.log('==============================================');
    console.log('New HD Wallet Mnemonic (BIP-39):');
    console.log(mnemonic);
    console.log('==============================================');

    const derivationPath = "m/44'/60'/0'/0/0";
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
    console.log('First derived address at', derivationPath, '->', wallet.address);
    console.log('==============================================');
    console.log('Store this mnemonic securely (e.g., .env -> HD_WALLET_MNEMONIC).');
  } catch (err) {
    console.error('Failed to generate mnemonic:', err);
    process.exit(1);
  }
})();


