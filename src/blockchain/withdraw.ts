import { ethers } from 'ethers';
import { getProvider, getFeeOverridesOrNull, TREASURY_PRIVATE_KEY, TREASURY_DERIVATION_INDEX } from './config';
import { getWalletForIndex } from './hd';

export async function sendWithdrawal(to: string, amountEth: string | number) {
  const provider = getProvider();
  if (!ethers.isAddress(to)) throw new Error('Invalid recipient address');
  const value = ethers.parseEther(String(amountEth));

  // Load signer preference: private key first, fallback to HD wallet derivation
  let signer: ethers.Wallet | ethers.HDNodeWallet;
  if (TREASURY_PRIVATE_KEY) {
    signer = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  } else {
    signer = getWalletForIndex(TREASURY_DERIVATION_INDEX).connect(provider);
  }

  const feeOverrides = getFeeOverridesOrNull();
  if (feeOverrides) {
    return await signer.sendTransaction({ to, value, ...feeOverrides });
  }

  const feeData = await provider.getFeeData();
  return await signer.sendTransaction({
    to,
    value,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
}


