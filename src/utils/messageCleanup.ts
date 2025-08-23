// src/utils/messageCleanup.ts
import { Context } from 'telegraf';

/**
 * Checks if the current chat is a group chat (group or supergroup)
 */
export function isGroupChat(ctx: Context): boolean {
  const chatType = ctx.chat?.type;
  return chatType === 'group' || chatType === 'supergroup';
}

/**
 * Deletes the message that triggered the callback query if it's in a group chat
 * This helps keep group chats clean by removing bot menu messages after interaction
 */
export async function deleteMessageInGroup(ctx: Context): Promise<void> {
  try {
    // Only delete messages in group chats, not in private chats
    if (isGroupChat(ctx) && ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      const message = ctx.callbackQuery.message;
      if (message && 'message_id' in message) {
        await ctx.telegram.deleteMessage(ctx.chat!.id, message.message_id);
      }
    }
  } catch (error) {
    // Silently ignore errors (message might already be deleted, bot might not have permissions, etc.)
    console.log('Failed to delete message in group:', error);
  }
}

/**
 * Edits the message to remove inline keyboard in group chats, or deletes it entirely
 * This is useful when you want to keep the message content but remove the buttons
 */
export async function removeKeyboardInGroup(ctx: Context, newText?: string): Promise<void> {
  try {
    if (isGroupChat(ctx) && ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      const message = ctx.callbackQuery.message;
      if (message && 'message_id' in message && 'text' in message) {
        if (newText) {
          // Edit message with new text and no keyboard
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            message.message_id,
            undefined,
            newText,
            { reply_markup: undefined }
          );
        } else {
          // Just remove the keyboard, keep original text
          await ctx.telegram.editMessageReplyMarkup(
            ctx.chat!.id,
            message.message_id,
            undefined,
            { inline_keyboard: [] }
          );
        }
      }
    }
  } catch (error) {
    // Silently ignore errors
    console.log('Failed to remove keyboard in group:', error);
  }
} 