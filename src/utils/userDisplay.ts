// src/utils/userDisplay.ts - Utility functions for user display formatting
import { Context } from 'telegraf';
import { User } from '../entities/User';

export function getUserDisplayFromUserPlain(user: User): string {
  if (user.username) {
    return `@${user.username}`;
  }
  return `User${user.telegramId}`;
}

export function formatUserMessage(ctx: Context, message: string): string {
  // Simple message formatting - can be enhanced later
  return message;
}

export function getUserDisplay(ctx: Context): string {
  const user = ctx.from;
  if (!user) return 'Unknown User';
  
  if (user.username) {
    return `@${user.username}`;
  }
  return `User${user.id}`;
}
