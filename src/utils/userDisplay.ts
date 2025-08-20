import { Context } from "telegraf";

/**
 * Escapes special Markdown characters in usernames
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Gets a user-friendly display name for Telegram users
 * Prioritizes username, falls back to first name, then to "Player"
 * Properly escapes Markdown characters
 */
export function getUserDisplay(ctx: Context): string {
  if (!ctx.from) return 'Player';
  
  // Prefer username with @ symbol
  if (ctx.from.username) {
    return escapeMarkdown(`@${ctx.from.username}`);
  }
  
  // Fall back to first name
  if (ctx.from.first_name) {
    return escapeMarkdown(ctx.from.first_name);
  }
  
  // Last resort
  return 'Player';
}

/**
 * Gets a user display for use in plain text (no Markdown escaping)
 */
export function getUserDisplayPlain(ctx: Context): string {
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
 * Gets a user display from user object (for PvP games)
 */
export function getUserDisplayFromUser(user: { username?: string | null; telegramId: number }): string {
  if (user.username) {
    return escapeMarkdown(`@${user.username}`);
  }
  return `${user.telegramId}`;
}

/**
 * Gets a user display from user object for plain text (no escaping)
 */
export function getUserDisplayFromUserPlain(user: { username?: string | null; telegramId: number }): string {
  if (user.username) {
    return `@${user.username}`;
  }
  return `${user.telegramId}`;
}

/**
 * Formats a message with username prefix for group chat clarity
 */
export function formatUserMessage(ctx: Context, message: string): string {
  const userDisplay = getUserDisplay(ctx);
  return `${userDisplay} ${message}`;
}