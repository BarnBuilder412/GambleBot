# Gasless Swap Implementation

This project now supports **gasless swaps** using a dedicated gas wallet. Users can swap tokens without paying gas fees - the gas costs are covered by a dedicated wallet.

## How It Works

### 1. **Gas Wallet Setup**
- A dedicated wallet (gas wallet) holds ETH for paying gas fees
- Users' tokens are swapped directly without them needing ETH for gas
- The gas wallet executes all swap transactions

### 2. **Two Implementation Approaches**

#### **Direct Gasless Swap** (`GaslessSwapService`)
- Gas wallet directly executes the swap
- User's tokens are swapped to USDC
- Gas wallet pays for the transaction
- **Best for**: Simple swaps, immediate execution

#### **Relay Service** (`RelayService`)
- User signs a transaction request
- Gas wallet verifies the signature and executes the transaction
- More secure, supports meta-transactions
- **Best for**: Advanced use cases, signature verification

## Configuration

Add these environment variables to enable gasless swaps:

```bash
# Gas wallet configuration
GAS_WALLET_PRIVATE_KEY=your_gas_wallet_private_key
GAS_WALLET_ADDRESS=0x...
ENABLE_GASLESS_SWAPS=true
```

## Usage Examples

### Basic Gasless Swap
```typescript
import { SwapService } from './swap/SwapService';

const swapService = new SwapService(adapters, 'eth_sepolia');

// Attempt gasless swap first
const result = await swapService.swapToUSDC({
  chainKey: 'eth_sepolia',
  fromAddress: '0x...',
  token: 'NATIVE',
  amountRaw: ethers.parseEther('0.1'),
  slippageBps: 50,
  usdcAddress: '0x...',
  preferGasless: true, // Enable gasless swaps
});
```

### Relay Service Usage
```typescript
import { RelayService } from './swap/RelayService';

const relayService = new RelayService(gasWalletPrivateKey, 'eth_sepolia');

// Create gasless transaction request
const request = await relayService.createGaslessTransactionRequest({
  from: userAddress,
  to: swapRouter,
  data: swapData,
  value: amount,
});

// User signs the request (frontend)
const signature = await userWallet.signMessage(request);

// Execute the gasless transaction
const result = await relayService.executeGaslessTransaction(request, signature);
```

## Benefits

1. **User Experience**: Users don't need ETH for gas fees
2. **Cost Efficiency**: Bulk gas purchases can reduce costs
3. **Accessibility**: Easier onboarding for new users
4. **Flexibility**: Fallback to regular swaps if gasless fails

## Security Considerations

1. **Gas Wallet Security**: Keep the gas wallet private key secure
2. **Balance Monitoring**: Regularly check gas wallet balance
3. **Rate Limiting**: Implement limits to prevent abuse
4. **Signature Verification**: Always verify user signatures in relay mode

## Monitoring

The service provides methods to monitor gas wallet status:

```typescript
// Check if gasless swaps are available
const isAvailable = swapService.isGaslessAvailable();

// Get gas wallet info
const walletInfo = swapService.getGasWalletInfo();

// Check gas wallet balance
const balance = await relayService.getGasWalletBalance();
```

## Fallback Strategy

If gasless swaps fail, the system automatically falls back to regular swaps:

1. Attempt gasless swap
2. If gasless fails, try regular swap
3. Log all attempts for monitoring

## Gas Estimation

The service automatically estimates gas requirements:

- Uses 20% buffer for safety
- Falls back to conservative estimates if estimation fails
- Checks gas wallet balance before execution

## Supported Chains

Currently configured for:
- **Ethereum Sepolia** (testnet)
- **Uniswap V3** with 0.3% fee tier
- **USDC** as the target token

## Future Enhancements

1. **Multi-chain Support**: Extend to other networks
2. **Gas Price Optimization**: Dynamic gas price strategies
3. **Batch Processing**: Execute multiple swaps in one transaction
4. **Analytics Dashboard**: Monitor gas usage and costs
5. **Automated Refills**: Auto-refill gas wallet when balance is low

## Troubleshooting

### Common Issues

1. **Insufficient Gas Wallet Balance**
   - Check gas wallet balance
   - Refill with ETH if needed

2. **Gasless Service Not Initialized**
   - Verify `GAS_WALLET_PRIVATE_KEY` is set
   - Check `ENABLE_GASLESS_SWAPS=true`

3. **Fallback to Regular Swaps**
   - Check logs for gasless failure reasons
   - Verify chain configuration

### Debug Mode

Enable detailed logging by checking console output:
- Gas wallet initialization
- Swap attempts and results
- Fallback decisions
- Gas cost calculations
