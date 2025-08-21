import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { getProvider, CHAINS } from '../blockchain/config';
import { getWalletForIndex } from '../blockchain/hd';
import { erc20Abi } from '../split/erc20Abi';
import { SwapService, UniswapV3Router02Adapter, UniswapV2PairDirectAdapter } from '../swap/SwapService';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (const a of args) {
    const [k, v] = a.split('=');
    if (k && v) out[k.replace(/^--/, '')] = v;
  }
  return out;
}

async function main() {
  const params = parseArgs();
  const chainKey = (params.chain || 'eth_sepolia') as string;
  const index = parseInt(params.index || '0', 10); // derivation index (user id)
  const amountEth = params.amount || '0.01';

  const chain = CHAINS.find(c => c.key === chainKey);
  if (!chain) throw new Error(`Unknown chainKey: ${chainKey}`);
  if (!chain.usdc) throw new Error(`USDC not configured for ${chainKey}`);

  const provider = getProvider(chainKey);
  const wallet = getWalletForIndex(index).connect(provider);
  const fromAddress = await wallet.getAddress();
  console.log(`Using chain=${chainKey} signer=${fromAddress} index=${index}`);

  const usdc = new ethers.Contract(chain.usdc, erc20Abi, provider);
  const before = await usdc.balanceOf(fromAddress);
  console.log(`USDC before: ${before} (raw)`);

  const adapters = [new UniswapV2PairDirectAdapter(), new UniswapV3Router02Adapter()];
  const swap = new SwapService(adapters);

  const amountRaw = ethers.parseUnits(amountEth, 18);
  console.log(`Swapping ${amountEth} ETH (raw=${amountRaw}) -> USDC`);

  const res = await swap.swapToUSDC({
    chainKey,
    fromAddress,
    token: 'NATIVE',
    amountRaw,
    slippageBps: 50,
    usdcAddress: chain.usdc,
  });

  // Approvals (should be none for NATIVE)
  if ((res as any).approvals && (res as any).approvals.length) {
    for (const appr of (res as any).approvals as ethers.TransactionRequest[]) {
      const sent = await wallet.sendTransaction(appr);
      console.log(`Approval tx: ${sent.hash}`);
      await sent.wait();
    }
  }

  // Send swap tx(s)
  if ((res as any).txRequests && (res as any).txRequests.length) {
    const reqs = (res as any).txRequests as ethers.TransactionRequest[];
    for (let i = 0; i < reqs.length; i++) {
      const sent = await wallet.sendTransaction(reqs[i]);
      console.log(`Swap step ${i + 1}/${reqs.length} tx: ${sent.hash}`);
      await sent.wait();
    }
  } else if ((res as any).txRequest) {
    const sent = await wallet.sendTransaction((res as any).txRequest);
    console.log(`Swap tx: ${sent.hash}`);
    const receipt = await sent.wait();
    if (receipt && typeof receipt.blockNumber === 'number') {
      console.log(`Swap mined in block ${receipt.blockNumber}`);
    } else {
      console.log('Swap mined.');
    }
  } else if (res.txHash) {
    console.log(`Swap already submitted: ${res.txHash}`);
  } else {
    throw new Error('Adapter returned neither txRequest nor txHash');
  }

  const after = await usdc.balanceOf(fromAddress);
  const delta = after > before ? after - before : 0n;
  console.log(`USDC after: ${after} (raw), received delta: ${delta}`);
  console.log(`Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


