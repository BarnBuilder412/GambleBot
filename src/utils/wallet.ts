// src/utils/wallet.ts
import * as bip39 from "bip39";
import { hdkey } from "ethereumjs-wallet";

const MNEMONIC = process.env.HD_WALLET_MNEMONIC;
if (!MNEMONIC) throw new Error("HD_WALLET_MNEMONIC not set");

const SEED = bip39.mnemonicToSeedSync(MNEMONIC);
const hdWallet = hdkey.fromMasterSeed(SEED);

export function generateDepositAddress(userId: number): string {
  // BIP44 Ethereum derivation path: m/44'/60'/0'/0/index
  const path = `m/44'/60'/0'/0/${userId}`;
  const childWallet = hdWallet.derivePath(path);
  const address = `0x${childWallet.getWallet().getAddress().toString("hex")}`;
  return address;
}