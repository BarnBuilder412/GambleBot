// src/tests/gasless-swap-test.ts
import { ethers } from 'ethers';
import { SwapService, UniswapV3Router02Adapter, UniswapV2PairDirectAdapter } from '../swap/SwapService';
import { GaslessSwapService } from '../swap/GaslessSwapService';
import { RelayService } from '../swap/RelayService';
import { CHAINS, getProvider } from '../blockchain/config';

async function testGaslessSwap() {
  console.log('🧪 Testing Gasless Swap Functionality\n');

  // Check if gasless swaps are enabled
  const gasWalletPrivateKey = process.env.GAS_WALLET_PRIVATE_KEY;
  const enableGasless = process.env.ENABLE_GASLESS_SWAPS === 'true';

  if (!enableGasless || !gasWalletPrivateKey) {
    console.log('❌ Gasless swaps not enabled. Set ENABLE_GASLESS_SWAPS=true and GAS_WALLET_PRIVATE_KEY');
    return;
  }

  console.log('✅ Gasless swaps enabled');
  console.log(`🔑 Gas wallet private key: ${gasWalletPrivateKey.slice(0, 6)}...${gasWalletPrivateKey.slice(-4)}`);

  // Initialize services
  const chainKey = 'eth_sepolia';
  const swapService = new SwapService([
    new UniswapV2PairDirectAdapter(),
    new UniswapV3Router02Adapter(),
  ], chainKey);

  const gaslessSwapService = new GaslessSwapService(gasWalletPrivateKey, chainKey);
  const relayService = new RelayService(gasWalletPrivateKey, chainKey);

  // Test gas wallet info
  console.log('\n📊 Gas Wallet Information:');
  console.log(`Address: ${gaslessSwapService.getGasWalletAddress()}`);
  
  const balance = await gaslessSwapService.getGasWalletBalance();
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.log('⚠️  Gas wallet has no balance. Please fund it to test gasless swaps.');
    return;
  }

  // Test gasless swap availability
  console.log('\n🔍 Service Status:');
  console.log(`SwapService gasless available: ${swapService.isGaslessAvailable()}`);
  console.log(`GaslessSwapService initialized: ${!!gaslessSwapService}`);
  console.log(`RelayService initialized: ${!!relayService}`);

  // Sanity check chain config for Sepolia
  console.log('\n🧭 Chain Config Sanity Check (eth_sepolia):');
  const cfgCheck = CHAINS.find(c => c.key === chainKey);
  if (!cfgCheck) {
    console.log('❌ Chain configuration not found for eth_sepolia');
    return;
  }
  console.log(`chainId=${cfgCheck.chainId}`);
  console.log(`rpcUrl=${cfgCheck.rpcUrl}`);
  console.log(`usdc=${cfgCheck.usdc}`);
  console.log(`weth=${cfgCheck.weth}`);
  console.log(`swapRouter02=${cfgCheck.swapRouter02}`);
  console.log(`uniswapV3Factory=${cfgCheck.uniswapV3Factory}`);
  if (!cfgCheck.weth) {
    console.log('❌ Missing WETH address in chain config. Please set CHAINS[].weth');
    return;
  }
  if (!cfgCheck.swapRouter02) {
    console.log('❌ Missing SwapRouter02 in chain config. Please set CHAINS[].swapRouter02');
    return;
  }

  // Test gas price estimation
  console.log('\n⛽ Gas Price Information:');
  const gasPrices = await relayService.getGasPrices();
  console.log(`Max Fee Per Gas: ${ethers.formatUnits(gasPrices.maxFeePerGas, 'gwei')} gwei`);
  console.log(`Max Priority Fee Per Gas: ${ethers.formatUnits(gasPrices.maxPriorityFeePerGas, 'gwei')} gwei`);

  // Test gas estimation against a valid contract (WETH9 deposit) to avoid router reverts
  console.log('\n🧮 Gas Estimation Test (WETH9 deposit):');
  const cfg = CHAINS.find(c => c.key === chainKey);
  if (!cfg || !cfg.weth) {
    console.log('⚠️  Missing WETH address in chain config, skipping gas estimation test.');
  } else {
    const wethIface = new ethers.Interface(['function deposit() payable']);
    const sampleDepositRequest = {
      from: gaslessSwapService.getGasWalletAddress(),
      to: cfg.weth,
      data: wethIface.encodeFunctionData('deposit', []),
      value: ethers.parseEther('0.001'),
    };

    try {
      const estimatedGas = await (relayService as any)['estimateGas'](sampleDepositRequest, getProvider(chainKey));
      console.log(`Estimated gas for WETH deposit: ${estimatedGas.toString()}`);
      const hasBalance = await relayService.hasSufficientGasBalance(estimatedGas);
      console.log(`Gas wallet has sufficient balance: ${hasBalance}`);
    } catch (error) {
      console.log(`⚠️  Gas estimation (deposit) failed: ${error}`);
    }
  }

  console.log('\n✅ Gasless swap test completed!');
  console.log('\n📝 To test actual swaps:');
  console.log('1. Ensure gas wallet has sufficient ETH balance');
  console.log('2. Use swapService.swapToUSDC() with preferGasless: true');
  console.log('3. Monitor logs for gasless vs regular swap attempts');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testGaslessSwap().catch(console.error);
}

export { testGaslessSwap };
