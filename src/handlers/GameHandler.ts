// src/handlers/GameHandler.ts
import { Context, Markup } from "telegraf";
import { GameManager } from "../services/GameManager";

export class GameHandler {
  private gameManager: GameManager;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
  }

  async handleWagerInput(ctx: Context): Promise<boolean> {
    // Only proceed if user has selected a game and not yet played
    if (ctx.session.game && !ctx.session.awaitingGuess && ctx.message && 'text' in ctx.message) {
      const result = await this.gameManager.processWager(ctx, ctx.session.game, ctx.message.text);
      
      if (!result.success) {
        await ctx.reply(result.message!);
        return true;
      }

      // Handle different games based on type
      switch (ctx.session.game) {
        case 'Dice':
          // Roll the dice (animated) first
          const diceMessage = await ctx.replyWithDice({ emoji: '🎲' });
          const diceValue = diceMessage.dice?.value || 1; // Get the actual dice value from Telegram
          console.log('Dice rolled:', diceValue);
          
          setTimeout(async () => {
            // Play the game with the actual dice value
            const diceResult = await this.gameManager.playDice(ctx, diceValue);
            if (diceResult.success) {
              const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Player';
              await ctx.reply(
                `${username} ${diceResult.message}`,
                Markup.inlineKeyboard([
                  [
                    Markup.button.callback('🎲 Play Dice Again', 'play_again_Dice'),
                    Markup.button.callback('🎮 Other Games', 'play')
                  ],
                  [Markup.button.callback('🏠 Main Menu', 'main_menu')]
                ])
              );
            } else {
              await ctx.reply(diceResult.message);
            }
            this.gameManager.clearSession(ctx); // Reset session for next game
          }, 4000); // Wait for dice animation
          break;
        
        case 'Coinflip':
          ctx.session.awaitingGuess = true;
          await ctx.reply(
            'Choose your side:',
            Markup.inlineKeyboard([
              [
                Markup.button.callback('🪙 Heads', 'coinflip_heads'),
                Markup.button.callback('🪙 Tails', 'coinflip_tails')
              ]
            ])
          );
          break;
        
        case 'Bowling':
          // Roll the bowling ball (animated) first
          const bowlingMessage = await ctx.replyWithDice({ emoji: '🎳' });
          const bowlingValue = bowlingMessage.dice?.value || 1; // Get the actual bowling value from Telegram
          console.log('Bowling rolled:', bowlingValue);
          
          setTimeout(async () => {
            // Play the game with the actual bowling value
            const bowlingResult = await this.gameManager.playBowling(ctx, bowlingValue);
            if (bowlingResult.success) {
              const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Player';
              await ctx.reply(
                `${username} ${bowlingResult.message}`,
                Markup.inlineKeyboard([
                  [
                    Markup.button.callback('🎳 Play Bowling Again', 'play_again_Bowling'),
                    Markup.button.callback('🎮 Other Games', 'play')
                  ],
                  [Markup.button.callback('🏠 Main Menu', 'main_menu')]
                ])
              );
            } else {
              await ctx.reply(bowlingResult.message);
            }
            this.gameManager.clearSession(ctx); // Reset session for next game
          }, 4000); // Wait for bowling animation
          break;
      }
      return true;
    }
    return false;
  }

  // Dice guess handler is no longer needed since dice game is automatic
  // Keeping this method for backward compatibility but it won't be used
  async handleDiceGuess(ctx: Context, guess: number): Promise<void> {
    await ctx.answerCbQuery();
    await ctx.reply("Dice game no longer requires guessing. Please start a new game!");
    this.gameManager.clearSession(ctx);
  }

  async handleCoinflipGuess(ctx: Context, guess: "heads" | "tails"): Promise<void> {
    await ctx.answerCbQuery();
    
    // Show coin flipping animation first
    await ctx.reply(`🪙 You chose **${guess.toUpperCase()}**!\n\nFlipping the coin...`, { parse_mode: "Markdown" });
    
    // Create coin flip animation using multiple messages
    const flipAnimation = await ctx.reply("🪙");
    
    // Animate the coin flip with different coin states
    const coinStates = ["🪙", "🪙"];
    
    for (let i = 0; i < coinStates.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay between frames
      try {
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          flipAnimation.message_id,
          undefined,
          coinStates[i]
        );
      } catch (e) {
        // Ignore edit errors (message might be too old)
      }
    }
    
    // Wait a moment before showing result
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = await this.gameManager.playCoinflip(ctx, guess);
    
    if (!result.success) {
      await ctx.reply(result.message);
      this.gameManager.clearSession(ctx);
      return;
    }

    const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Player';
    await ctx.reply(
      `${username} ${result.message}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🪙 Play Coinflip Again', 'play_again_Coinflip'),
          Markup.button.callback('🎮 Other Games', 'play')
        ],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    );
    this.gameManager.clearSession(ctx); // Reset session for next game
  }
} 