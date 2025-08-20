import { ethers } from 'ethers';
import { DERIVATION_PATH_PREFIX, HD_WALLET_MNEMONIC } from './config';

export function assertMnemonic() {
  if (!HD_WALLET_MNEMONIC) throw new Error('HD_WALLET_MNEMONIC not set');
}

export function getWalletForIndex(userIndex: number): ethers.HDNodeWallet {
  assertMnemonic();
  const path = `${DERIVATION_PATH_PREFIX}/${userIndex}`;
  // Construct the derived wallet directly from phrase + path to avoid non-root derivation errors
  return ethers.HDNodeWallet.fromPhrase(HD_WALLET_MNEMONIC, undefined, path);
}

export function getAddressForIndex(userIndex: number): string {
  const w = getWalletForIndex(userIndex);
  return ethers.getAddress(w.address);
}


