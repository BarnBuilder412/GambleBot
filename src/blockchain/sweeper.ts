import { ethers } from 'ethers';
import { getProvider, TREASURY_ADDRESS, getFeeOverridesOrNull, MIN_SWEEP_WEI } from './config';

export async function sweepFromDerived(wallets: ethers.Wallet[], destination?: string) {
  const provider = getProvider();
  const to = destination || TREASURY_ADDRESS;
  if (!to) throw new Error('Destination address or TREASURY_ADDRESS is required');

  const feeOverrides = getFeeOverridesOrNull();
  const results: Array<{ from: string; status: string; txHash?: string; reason?: string; dustLeft?: string }> = [];

  for (const w of wallets) {
    const signer = w.connect(provider);
    const from = await signer.getAddress();
    const bal = await provider.getBalance(from);
    
    if (bal < MIN_SWEEP_WEI || bal === 0n) {
      results.push({ from, status: 'skipped', reason: 'below min threshold' });
      continue;
    }

    try {
      let tx: ethers.TransactionResponse;
      
      if (feeOverrides && feeOverrides.maxFeePerGas) {
        // Use fixed fee overrides - more predictable
        const gasLimit = 21000n;
        const maxCost = (feeOverrides.maxFeePerGas as bigint) * gasLimit;
        
        if (bal <= maxCost) {
          results.push({ from, status: 'skipped', reason: 'balance too low for gas' });
          continue;
        }
        
        // Leave small buffer for gas price fluctuations
        const transferable = bal - maxCost;
        tx = await signer.sendTransaction({ 
          to, 
          value: transferable, 
          gasLimit,
          ...feeOverrides 
        });
        
      } else {
        // Dynamic fee estimation - more aggressive sweep
        const feeData = await provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas ?? 0n;
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
        
        // Try multiple strategies, starting aggressive
        const strategies = [
          { gasLimit: 21000n, feeMultiplier: 1.1 },  // 10% buffer
          { gasLimit: 21000n, feeMultiplier: 1.2 },  // 20% buffer  
          { gasLimit: 25000n, feeMultiplier: 1.3 },  // Higher gas + 30% buffer
        ];
        
        let success = false;
        for (const strategy of strategies) {
          const adjustedMaxFee = BigInt(Math.floor(Number(maxFeePerGas) * strategy.feeMultiplier));
          const maxCost = adjustedMaxFee * strategy.gasLimit;
          
          if (bal <= maxCost) continue;
          
          const transferable = bal - maxCost;
          
          try {
            tx = await signer.sendTransaction({
              to,
              value: transferable,
              gasLimit: strategy.gasLimit,
              maxFeePerGas: adjustedMaxFee,
              maxPriorityFeePerGas: maxPriorityFeePerGas
            });
            success = true;
            break;
          } catch (error: any) {
            console.log(`⚠️ Strategy failed for ${from}: ${error.message}`);
            continue;
          }
        }
        
        if (!success) {
          results.push({ from, status: 'failed', reason: 'all sweep strategies failed' });
          continue;
        }
      }
      
      // Wait for transaction and check remaining balance
      const receipt = await tx!.wait();
      const remainingBal = await provider.getBalance(from);
      const dustLeftEth = ethers.formatEther(remainingBal);
      
      results.push({ 
        from, 
        status: 'submitted', 
        txHash: tx!.hash,
        dustLeft: remainingBal > 0n ? `${dustLeftEth} ETH` : '0 ETH'
      });
      
    } catch (error: any) {
      results.push({ from, status: 'error', reason: error.message });
    }
  }
  return results;
}


