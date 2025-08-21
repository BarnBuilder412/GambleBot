import { ethers } from 'ethers';
import { erc20Abi } from './erc20Abi';
import { getFeeOverridesOrNull } from '../blockchain/config';

export type SplitResult = { masterTx: string; feeTx: string; masterAmount: bigint; feeAmount: bigint };

export async function splitUsdc(params: {
  provider: ethers.Provider;
  usdc: string;
  fromSigner: ethers.Signer;
  master: string;
  fee: string;
  amountRaw: bigint;              // 6 decimals
  bpsMaster: number;              // e.g., 9000
  bpsFee: number;                 // e.g., 1000
  devMode?: boolean;              // if true, skip on-chain execution
}): Promise<SplitResult> {
  const masterAmount = (params.amountRaw * BigInt(params.bpsMaster)) / 10000n;
  const feeAmount = params.amountRaw - masterAmount;

  if (params.devMode) {
    // Development mode: just calculate amounts without on-chain execution
    return { 
      masterTx: 'split-dev-master', 
      feeTx: 'split-dev-fee', 
      masterAmount, 
      feeAmount 
    };
  }

  // Production mode: execute on-chain transfers
  const signer = params.fromSigner.connect(params.provider);
  const token = new ethers.Contract(params.usdc, erc20Abi, signer);
  // Apply fee overrides if configured (EIP-1559 caps)
  const feeOverrides = getFeeOverridesOrNull();

  const tx1 = await token.transfer(params.master, masterAmount, feeOverrides || {});
  const tx2 = await token.transfer(params.fee, feeAmount, feeOverrides || {});
  await tx1.wait();
  await tx2.wait();
  return { masterTx: tx1.hash, feeTx: tx2.hash, masterAmount, feeAmount };
}


