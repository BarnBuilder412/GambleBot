// src/handlers/MenuHandler.ts
import { Context, Markup } from "telegraf";
import { UserService } from "../services/UserService";
import { GameManager } from "../services/GameManager";

export class MenuHandler {
  private userService: UserService;
  private gameManager: GameManager;

  constructor(userService: UserService, gameManager: GameManager) {
    this.userService = userService;
    this.gameManager = gameManager;
  }

  async handleStart(ctx: Context): Promise<void> {
    const user = await this.userService.getOrCreateUser(ctx);

    await ctx.reply(
      `Welcome, ${ctx.from?.first_name}!\nBalance: ${user.balance.toFixed(4)} ETH`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🎲 Play", "play")],
        [Markup.button.callback("💰 Deposit Address", "deposit")],
        [Markup.button.callback("🏧 Withdraw", "withdraw")],
        [Markup.button.callback("⚙️ Settings", "settings")],
      ])
    );
  }

  async handlePlay(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const games = this.gameManager.getAvailableGames();
    
    await ctx.reply(
      "Choose a game:",
      Markup.inlineKeyboard(
        games.map((g) => Markup.button.callback(g, "game_" + g))
      )
    );
  }

  async handleGameSelection(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    
    if (!this.gameManager.isValidGame(gameName)) {
      await ctx.reply("Invalid game selected.");
      return;
    }

    ctx.session.game = gameName;
    
    // Show wager options and game rules
    const wagerButtons = [
      [
        Markup.button.callback("💰 0.001 ETH", `wager_${gameName}_0.001`),
        Markup.button.callback("💰 0.005 ETH", `wager_${gameName}_0.005`),
        Markup.button.callback("💰 0.01 ETH", `wager_${gameName}_0.01`)
      ],
      [
        Markup.button.callback("💰 0.05 ETH", `wager_${gameName}_0.05`),
        Markup.button.callback("💰 0.1 ETH", `wager_${gameName}_0.1`),
        Markup.button.callback("💰 0.5 ETH", `wager_${gameName}_0.5`)
      ],
      [
        Markup.button.callback("💰 1 ETH", `wager_${gameName}_1`),
        Markup.button.callback("💰 5 ETH", `wager_${gameName}_5`)
      ]
    ];

    // Add game rules button
    if (gameName === 'Dice') {
      wagerButtons.push([Markup.button.callback("📋 Game Rules", "dice_rules")]);
    } else if (gameName === 'Bowling') {
      wagerButtons.push([Markup.button.callback("📋 Game Rules", "bowling_rules")]);
    } else if (gameName === 'Coinflip') {
      wagerButtons.push([Markup.button.callback("📋 Game Rules", "coinflip_rules")]);
    }

    // Add back button
    wagerButtons.push([
      Markup.button.callback("🔙 Back", "play")
    ]);

    await ctx.reply(
      `🎮 **${gameName} Game Selected!**\n\n💰 Choose your wager amount:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(wagerButtons)
      }
    );
  }

  async handleSettings(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.userService.getOrCreateUser(ctx);
    
    await ctx.reply(
      `Settings:\nUsername: ${user.username}\nBalance: ${user.balance.toFixed(4)} ETH\nDeposit Address: \`${user.depositAddress}\``,
      { parse_mode: "MarkdownV2" }
    );
  }

  async handleDiceRules(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    
    const rulesMessage = `🎲 **DICE GAME RULES** 🎲

🎯 **How to Play:**
• Place your wager amount
• Dice will roll automatically (1-6)
• No guessing required!

🏆 **Winning Conditions:**
• **WIN**: If dice shows 4, 5, or 6
• **LOSE**: If dice shows 1, 2, or 3

💰 **Payouts:**
• Win = 2x your wager
• 50% chance to win

🎮 **Example:**
• Wager: 0.1 ETH
• Dice rolls 5 → You win 0.2 ETH!
• Dice rolls 2 → You lose your wager

Good luck! 🍀`;

    await ctx.reply(rulesMessage, { parse_mode: "Markdown" });
  }

  async handleBowlingRules(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    
    const rulesMessage = `🎳 **BOWLING GAME RULES** 🎳

🎯 **How to Play:**
• Place your wager amount
• Bowling ball will roll automatically
• No guessing required!

🏆 **Winning Conditions:**
• **STRIKE (10 pins)**: 3x payout
• **Great Roll (7-9 pins)**: 1.5x payout  
• **Poor Roll (0-6 pins)**: You lose

💰 **Payouts:**
• Strike = 3x your wager
• Great Roll = 1.5x your wager
• Poor Roll = Loss

🎮 **Example:**
• Wager: 0.1 ETH
• Roll Strike (10 pins) → You win 0.3 ETH!
• Roll 8 pins → You win 0.15 ETH!
• Roll 4 pins → You lose your wager

🎳 **Pin Mapping:**
• Animation 6 = 10 pins (Strike! - 3x payout)
• Animation 5 = 9 pins (Great - 1.5x payout)
• Animation 4 = 7 pins (Great - 1.5x payout)
• Animation 3 = 5 pins (Loss)
• Animation 2 = 3 pins (Loss)
• Animation 1 = 0 pins (Gutter ball - Loss)

Good luck! 🍀`;

    await ctx.reply(rulesMessage, { parse_mode: "Markdown" });
  }

  async handleCoinflipRules(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    
    const rulesMessage = `🪙 **COINFLIP GAME RULES** 🪙

🎯 **How to Play:**
• Place your wager amount
• Choose Heads or Tails
• Coin will flip automatically!

🏆 **Winning Conditions:**
• **Correct Guess**: 2x payout
• **Wrong Guess**: You lose

💰 **Payouts:**
• Win = 2x your wager
• 50% chance to win

🎮 **Example:**
• Wager: 0.1 ETH
• Choose Heads → Coin shows Heads → You win 0.2 ETH!
• Choose Tails → Coin shows Heads → You lose your wager

Good luck! 🍀`;

    await ctx.reply(rulesMessage, { parse_mode: "Markdown" });
  }

  async handleWagerSelection(ctx: Context, gameName: string, wagerAmount: string): Promise<void> {
    await ctx.answerCbQuery();
    
    const wager = parseFloat(wagerAmount);
    ctx.session.game = gameName;
    ctx.session.wager = wager;

    await ctx.reply(`✅ Wager set: ${wager} ETH for ${gameName}\n\nStarting game...`);

    // Trigger the game based on type
    const gameHandler = new (await import('./GameHandler')).GameHandler(this.gameManager);
    
    switch (gameName) {
      case 'Dice':
        // Auto-play dice game
        const diceMessage = await ctx.replyWithDice({ emoji: '🎲' });
        const diceValue = diceMessage.dice?.value || 1;
        console.log('Dice rolled:', diceValue);
        
        setTimeout(async () => {
          const diceResult = await this.gameManager.playDice(ctx, diceValue);
          if (diceResult.success) {
            await ctx.reply(
              diceResult.message,
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
          this.gameManager.clearSession(ctx);
        }, 4000);
        break;

      case 'Coinflip':
        // Show heads/tails buttons
        ctx.session.awaitingGuess = true;
        await ctx.reply(
          '🪙 **Coinflip Game Ready!**\n\nChoose your side:',
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('🪙 Heads', 'coinflip_heads'),
                Markup.button.callback('🪙 Tails', 'coinflip_tails')
              ]
            ])
          }
        );
        break;

      case 'Bowling':
        // Auto-play bowling game
        const bowlingMessage = await ctx.replyWithDice({ emoji: '🎳' });
        const bowlingValue = bowlingMessage.dice?.value || 1;
        console.log('Bowling rolled:', bowlingValue);
        
        setTimeout(async () => {
          const bowlingResult = await this.gameManager.playBowling(ctx, bowlingValue);
          if (bowlingResult.success) {
            await ctx.reply(
              bowlingResult.message,
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
          this.gameManager.clearSession(ctx);
        }, 4000);
        break;
    }
  }



  async handlePlayAgain(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    
    // Clear any existing session
    ctx.session = {};
    
    // Start the game selection process again
    await this.handleGameSelection(ctx, gameName);
  }}