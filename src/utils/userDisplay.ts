import { Context } from "telegraf";

/**
 * Gets a user-friendly display name for Telegram users
 * Prioritizes username, falls back to first name, then to "Player"
 */
export function getUserDisplay(ctx: Context): string {
  if (!ctx.from) return 'Player';
  
  // Prefer username with @ symbol
  if (ctx.from.username) {
    return `@${ctx.from.username}`;
  }
  
  // Fall back to first name
  if (ctx.from.first_name) {
    return ctx.from.first_name;
  }
  
  // Last resort
  return 'Player';
}

/**
 * Gets a compact user display for shorter messages
 * Uses first name if available, otherwise username
 */
export function getUserDisplayCompact(ctx: Context): string {
  if (!ctx.from) return 'Player';
  
  // Prefer first name for shorter display
  if (ctx.from.first_name) {
    return ctx.from.first_name;
  }
  
  // Fall back to username
  if (ctx.from.username) {
    return `@${ctx.from.username}`;
  }
  
  // Last resort
  return 'Player';
}

/**
 * Formats a message with username prefix for group chat clarity
 */
export function formatUserMessage(ctx: Context, message: string): string {
  const userDisplay = getUserDisplay(ctx);
  return `${userDisplay} ${message}`;
} 