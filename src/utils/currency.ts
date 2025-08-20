// src/utils/currency.ts - Temporary currency conversion utilities
// TODO: Replace with real-time rates and USDC integration later

// Fixed conversion rate: $4250 per ETH (temporary)
const USD_PER_ETH = 4250;

/**
 * Convert USD amount to ETH
 * @param usdAmount Amount in USD
 * @returns Amount in ETH
 */
export function usdToEth(usdAmount: number): number {
  return usdAmount / USD_PER_ETH;
}

/**
 * Convert ETH amount to USD
 * @param ethAmount Amount in ETH
 * @returns Amount in USD
 */
export function ethToUsd(ethAmount: number): number {
  return ethAmount * USD_PER_ETH;
}

/**
 * Format USD amount for display
 * @param usdAmount Amount in USD
 * @returns Formatted string like "$1.50"
 */
export function formatUsd(usdAmount: number): string {
  return `$${usdAmount.toFixed(2)}`;
}

/**
 * Format ETH amount for display
 * @param ethAmount Amount in ETH
 * @returns Formatted string like "0.0012 ETH"
 */
export function formatEth(ethAmount: number): string {
  return `${ethAmount.toFixed(6)} ETH`;
}

/**
 * Get the current USD/ETH conversion rate
 * @returns Current rate (USD per ETH)
 */
export function getCurrentRate(): number {
  return USD_PER_ETH;
} 