import { ethers } from 'ethers';
import https from 'https';
import { CHAINS, getProvider } from '../blockchain/config';
import { uniswapV3FactoryAbi } from './UniswapV3FactoryAbi';
import { uniswapV3PoolAbi } from './UniswapV3PoolAbi';
import { uniswapV2FactoryAbi } from './UniswapV2FactoryAbi';
import { uniswapV2PairAbi } from './UniswapV2PairAbi';
export type SwapResult = { txHash: string; usdcAmountRaw: bigint; router: string; txRequest?: ethers.TransactionRequest; approvals?: ethers.TransactionRequest[] };

export interface ISwapAdapter {
  execute(params: {
    chainKey?: string;
    fromAddress: string;
    sellToken: 'NATIVE' | string;
    buyToken: string;           // USDC address
    amountInRaw: bigint;
    slippageBps: number;
  }): Promise<SwapResult>;
}

export class SwapService {
  constructor(private adapters: ISwapAdapter[]) { }
  async swapToUSDC(args: {
    chainKey?: string;
    fromAddress: string;
    token: 'NATIVE' | string;
    amountRaw: bigint;
    slippageBps: number;
    usdcAddress: string;
  }): Promise<SwapResult> {
    let lastErr: any;
    for (const a of this.adapters) {
      try {
        return await a.execute({
          chainKey: args.chainKey,
          fromAddress: args.fromAddress,
          sellToken: args.token,
          buyToken: args.usdcAddress,
          amountInRaw: args.amountRaw,
          slippageBps: args.slippageBps,
        });
      } catch (e: any) {
        // Surface adapter error for easier debugging, then try next
        const name = (a as any).constructor?.name || 'Adapter';
        console.warn(`[SwapService] ${name} failed: ${e?.message || e}`);
        lastErr = e;
      }
    }
    throw lastErr;
  }
}

export class UniswapV3Router02Adapter implements ISwapAdapter {
  async execute(params: {
    chainKey?: string;
    fromAddress: string;
    sellToken: 'NATIVE' | string;
    buyToken: string;           // USDC
    amountInRaw: bigint;        // 18-dec for ETH/WETH, token decimals for ERC20
    slippageBps: number;        // e.g., 50 = 0.5%
  }): Promise<SwapResult> {
    const chain = CHAINS.find(c => c.key === params.chainKey);
    if (!chain || !chain.swapRouter02) throw new Error('SwapRouter02 not configured for this chain');

    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min
    let tokenIn = params.sellToken === 'NATIVE' ? (chain.weth as string) : params.sellToken;

    const provider = getProvider(params.chainKey);
    const routerIntf = new ethers.Interface([
      'function factory() view returns (address)',
      'function WETH9() view returns (address)'
    ]);
    const router = new ethers.Contract(chain.swapRouter02, routerIntf, provider);

    // Read factory/WETH9 from router if available to avoid mismatches
    let routerFactoryAddress: string | undefined = chain.uniswapV3Factory;
    try { routerFactoryAddress = await router.factory(); } catch {}
    if (!routerFactoryAddress) throw new Error('Router does not expose factory() and no factory configured');
    try {
      if (params.sellToken === 'NATIVE') {
        const routerWeth: string = await router.WETH9();
        if (routerWeth) tokenIn = routerWeth;
      }
    } catch {}

    // Use the 3000 fee tier (0.3%) for Uniswap V3 pools
    const factory = new ethers.Contract(routerFactoryAddress, uniswapV3FactoryAbi, provider);
    const selectedFee = 3000;
    const poolAddr: string = await factory.getPool(tokenIn, params.buyToken, selectedFee);
    if (!poolAddr || poolAddr === ethers.ZeroAddress) {
      throw new Error('No Uniswap V3 pool found for token pair with 3000 fee tier');
    }
    const pool = new ethers.Contract(poolAddr, uniswapV3PoolAbi, provider);
    try {
      const liquidity: bigint = await pool.liquidity();
      if (liquidity === 0n) {
        throw new Error('Uniswap V3 pool has no liquidity for token pair with 3000 fee tier');
      }
    } catch {
      throw new Error('Failed to check liquidity for Uniswap V3 pool with 3000 fee tier');
    }

    // Minimum out: without a quote, set to 0 to avoid revert; production should use a quoter
    const minOut = 0n;

    const iface = new ethers.Interface([
      'function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'
    ]);

    const data = iface.encodeFunctionData('exactInputSingle', [{
      tokenIn,
      tokenOut: params.buyToken,
      fee: selectedFee,
      recipient: params.fromAddress,
      deadline,
      amountIn: params.amountInRaw,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0,
    }]);

    const txReq: ethers.TransactionRequest = {
      to: chain.swapRouter02,
      data,
      value: params.sellToken === 'NATIVE' ? params.amountInRaw : 0n,
    };

    // Prepare approval if selling ERC-20
    const approvals: ethers.TransactionRequest[] = [];
    if (params.sellToken !== 'NATIVE') {
      const erc20Iface = new ethers.Interface(['function approve(address spender,uint256 value) returns (bool)']);
      approvals.push({
        to: params.sellToken,
        data: erc20Iface.encodeFunctionData('approve', [chain.swapRouter02, params.amountInRaw]),
        value: 0n,
      });
    }

    // Return txRequest(s) for caller to sign with the deposit wallet signer
    return { txHash: '', usdcAmountRaw: 0n, router: 'uniswap-v3-router02', txRequest: txReq, approvals };
  }
}

// Uniswap V2 direct-pair adapter: WETH/USDC swap using pair directly
export class UniswapV2PairDirectAdapter implements ISwapAdapter {
  async execute(params: {
    chainKey?: string;
    fromAddress: string;
    sellToken: 'NATIVE' | string;
    buyToken: string;           // USDC
    amountInRaw: bigint;        // 18 for ETH/WETH
    slippageBps: number;
  }): Promise<SwapResult> {
    const chain = CHAINS.find(c => c.key === params.chainKey);
    if (!chain || !chain.uniswapV2Factory || !chain.weth) {
      throw new Error('UniswapV2Factory or WETH not configured for this chain');
    }
    if (params.sellToken !== 'NATIVE' && params.sellToken.toLowerCase() !== chain.weth.toLowerCase()) {
      throw new Error('This adapter supports only ETH/WETH -> USDC');
    }

    const provider = getProvider(params.chainKey);

    // Resolve pair
    const factory = new (ethers as any).Contract(chain.uniswapV2Factory, uniswapV2FactoryAbi, provider);
    const weth = chain.weth;
    const token0 = weth.toLowerCase() < params.buyToken.toLowerCase() ? weth : params.buyToken;
    const token1 = weth.toLowerCase() < params.buyToken.toLowerCase() ? params.buyToken : weth;
    const pairAddr: string = await factory.getPair(token0, token1);
    if (!pairAddr || pairAddr === ethers.ZeroAddress) {
      throw new Error('Uniswap V2 pair not found for WETH/USDC');
    }
    const pair = new (ethers as any).Contract(pairAddr, uniswapV2PairAbi, provider);

    // Compute expected out using reserves and 0.3% fee
    const [reserve0, reserve1] = await (async () => {
      const r = await pair.getReserves();
      return [BigInt(r.reserve0), BigInt(r.reserve1)];
    })();
    const isWethToken0 = (await pair.token0()).toLowerCase() === weth.toLowerCase();
    const reserveIn = isWethToken0 ? reserve0 : reserve1;
    const reserveOut = isWethToken0 ? reserve1 : reserve0;
    if (reserveIn === 0n || reserveOut === 0n) throw new Error('Pair has no liquidity');
    const amountInWithFee = params.amountInRaw * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    const amountOut = numerator / denominator;
    const minOut = amountOut * BigInt(10000 - params.slippageBps) / 10000n;

    // Steps:
    // 1) If NATIVE, wrap ETH -> WETH by sending to WETH9 deposit()
    const txRequests: ethers.TransactionRequest[] = [];
    if (params.sellToken === 'NATIVE') {
      // Reserve some ETH for gas fees (3 transactions worth)
      const gasReserve = 21000n * 2n * 10000000000n; // ~0.00042 ETH at 10 gwei
      const wrapAmount = params.amountInRaw - gasReserve;
      if (wrapAmount <= 0n) throw new Error('Insufficient ETH amount to cover gas fees');
      
      const wethIface = new ethers.Interface(['function deposit() payable']);
      txRequests.push({ to: weth, data: wethIface.encodeFunctionData('deposit', []), value: wrapAmount });
    }
    // 2) Transfer WETH to pair
    const erc20Iface = new ethers.Interface(['function transfer(address to,uint256 value) returns (bool)']);
    txRequests.push({ to: weth, data: erc20Iface.encodeFunctionData('transfer', [pairAddr, params.amountInRaw]), value: 0n });
    // 3) Call pair.swap to send USDC to taker
    const amount0Out = isWethToken0 ? 0n : minOut;
    const amount1Out = isWethToken0 ? minOut : 0n;
    const pairIface = new ethers.Interface(['function swap(uint amount0Out,uint amount1Out,address to,bytes data)']);
    txRequests.push({ to: pairAddr, data: pairIface.encodeFunctionData('swap', [amount0Out, amount1Out, params.fromAddress, '0x']), value: 0n });

    return { txHash: '', usdcAmountRaw: minOut, router: 'uniswap-v2-direct', approvals: [], ...(txRequests.length ? { txRequests } as any : {}) } as any;
  }
}

function buildEncodedPath(args: { tokenIn: string; tokenOut: string; fee: number }): string {
  const FEE_TIER = args.fee; // 500, 3000, 10000
  const feeHex = ethers.toBeHex(FEE_TIER, 3).slice(2).padStart(6, '0');
  // Path: tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)
  return '0x' + args.tokenIn.toLowerCase().slice(2) + feeHex + args.tokenOut.toLowerCase().slice(2);
}

function httpGetJson(urlStr: string, headers?: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const options: https.RequestOptions = {
        method: 'GET',
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers,
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', (err) => reject(err));
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}


