import { ethers } from "ethers";
import { CHAINS, getProvider } from "../blockchain/config";

// Use configured Sepolia
const chainKey = 'eth_sepolia';
const cfg = CHAINS.find(c => c.key === chainKey);
if (!cfg) {
  console.error('❌ Chain config not found for eth_sepolia');
  process.exit(1);
}
const provider = getProvider(chainKey);

// Uniswap V3 Factory from config
const UNISWAP_V3_FACTORY = cfg.uniswapV3Factory as string;

const factoryAbi = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address)"
];

// Tokens from config
const WETH = cfg.weth as string;
const USDC = cfg.usdc;

async function checkPools() {
  console.log(`🔗 Using RPC: ${cfg!.rpcUrl}`);
  console.log(`🧩 WETH: ${WETH}`);
  console.log(`🧩 USDC: ${USDC}`);
  console.log(`🏭 Factory: ${UNISWAP_V3_FACTORY}`);

  const factory = new ethers.Contract(UNISWAP_V3_FACTORY, factoryAbi, provider);
  const feeTiers = [100, 500, 3000, 10000];

  for (let fee of feeTiers) {
    try {
      const pool = await factory.getPool(WETH, USDC, fee);
      if (pool === ethers.ZeroAddress) {
        console.log(`❌ No pool for fee tier ${fee}`);
      } else {
        console.log(`✅ Pool found for fee tier ${fee}: ${pool}`);
      }
    } catch (e) {
      console.log(`⚠️ Failed to query fee tier ${fee}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

checkPools().catch((e) => { console.error(e); process.exit(1); });
