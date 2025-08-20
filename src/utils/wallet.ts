// src/utils/wallet.ts
import { getAddressForIndex } from "../blockchain/hd";

export function generateDepositAddress(userId: number): string {
  return getAddressForIndex(userId);
}