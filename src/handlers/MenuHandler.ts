// src/handlers/MenuHandler.ts
import { Context, Markup } from "telegraf";
import { UserService } from "../services/UserService";
import { GameManager } from "../services/GameManager";
import { MultiplayerService } from "../services/MultiplayerService";
import { formatUserMessage, getUserDisplay } from "../utils/userDisplay";

export class MenuHandler {
  private userService: UserService;
  private gameManager: GameManager;
  private multiplayer: MultiplayerService;

  constructor(userService: UserService, gameManager: GameManager) {
    this.userService = userService;
    this.gameManager = gameManager;
    this.multiplayer = new MultiplayerService(userService);
  }

  async handleStart(ctx: Context): Promise<void> {
    const user = await this.userService.getOrCreateUser(ctx);
    const uid = ctx.from?.id;

    await ctx.reply(
      `Welcome, ${ctx.from?.first_name}!\nBalance: ${user.balance.toFixed(4)} $`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🎲 Play", `play_u${uid}`)],
        [Markup.button.callback("💰 Deposit Address", `deposit_u${uid}`)],
        [Markup.button.callback("🏧 Withdraw", `withdraw_u${uid}`)],
        [Markup.button.callback("⚙️ Settings", `settings_u${uid}`)],
      ])
    );
  }

  async handlePlay(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const games = this.gameManager.getAvailableGames();
    const uid = ctx.from?.id;
    
    await ctx.reply(
      "Choose a game:",
      Markup.inlineKeyboard(
        games.map((g) => Markup.button.callback(g, `game_${g}_u${uid}`))
      )
    );
  }

  async handleGameSelection(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    const uid = ctx.from?.id;
    
    if (!this.gameManager.isValidGame(gameName)) {
      await ctx.reply(formatUserMessage(ctx, "Invalid game selected."));
      return;
    }

    ctx.session.game = gameName;
    
    // Show wager options and game rules
    const wagerButtons = [
      [
        Markup.button.callback("$0.10", `wager_${gameName}_0.1_u${uid}`),
        Markup.button.callback("$0.50", `wager_${gameName}_0.5_u${uid}`),
        Markup.button.callback("$1", `wager_${gameName}_1_u${uid}`)
      ],
      [
        Markup.button.callback("$5", `wager_${gameName}_5_u${uid}`),
        Markup.button.callback("$10", `wager_${gameName}_10_u${uid}`),
        Markup.button.callback("$25", `wager_${gameName}_25_u${uid}`)
      ],
      [
        Markup.button.callback("$50", `wager_${gameName}_50_u${uid}`),
        Markup.button.callback("$100", `wager_${gameName}_100_u${uid}`)
      ],
      [
        Markup.button.callback("Half Balance", `wager_${gameName}_half_u${uid}`),
        Markup.button.callback("Full Balance", `wager_${gameName}_full_u${uid}`)
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
      Markup.button.callback("🔙 Back", `play_u${uid}`)
    ]);

    await ctx.reply(
      formatUserMessage(ctx, `🎮 **${gameName} Game Selected!**\n\n💰 Choose your wager amount:`),
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
      `Settings:\nUsername: ${user.username}\nBalance: ${user.balance.toFixed(4)} $\nDeposit Address: \`${user.depositAddress}\``,
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
• Wager: $50
• Dice rolls 5 → You win $100!
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
• Wager: $50
• Roll Strike (10 pins) → You win $150!
• Roll 8 pins → You win $75!
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
• Wager: $50
• Choose Heads → Coin shows Heads → You win $100!
• Choose Tails → Coin shows Heads → You lose your wager

Good luck! 🍀`;

    await ctx.reply(rulesMessage, { parse_mode: "Markdown" });
  }

  async handleWagerSelection(ctx: Context, gameName: string, wagerAmount: string): Promise<void> {
    await ctx.answerCbQuery();
    
    let wager: number;
    
    // Handle balance-based wagering
    if (wagerAmount === 'half' || wagerAmount === 'full') {
      const user = await this.userService.getOrCreateUser(ctx);
      
      if (wagerAmount === 'half') {
        wager = user.balance / 2;
      } else { // full
        wager = user.balance;
      }
      
      // Check if user has sufficient balance
      if (wager <= 0) {
        await ctx.reply(
          "❌ **Insufficient Balance**\n\nYou don't have enough funds to place this wager.\n\nPlease make a deposit first!",
          { parse_mode: "Markdown" }
        );
        return;
      }
    } else {
      wager = parseFloat(wagerAmount);
    }
    
    ctx.session.game = gameName;
    ctx.session.wager = wager;
    const uid = ctx.from?.id;
    
    await ctx.reply(
      formatUserMessage(ctx, `✅ Wager set: ${wager} $ for ${gameName}\n\nChoose how to play:`),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🤖 Play vs Bot', `pve_${gameName}_u${uid}`),
          Markup.button.callback('🧑‍🤝‍🧑 Create Challenge', `pvp_create_${gameName}_u${uid}`)
        ],
        [Markup.button.callback('📝 View Open Challenges', `pvp_list_${gameName}`)],
        [Markup.button.callback('🔙 Back', `play_u${uid}`)]
      ])
    );
  }

  async handlePlayVsBot(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    const wager = ctx.session.wager;
    const uid = ctx.from?.id;
    if (!wager) {
      await ctx.reply(formatUserMessage(ctx, "Please pick a wager first."));
      return;
    }
    switch (gameName) {
      case 'Dice': {
        const diceMessage = await ctx.replyWithDice({ emoji: '🎲' });
        const diceValue = diceMessage.dice?.value || 1;
        setTimeout(async () => {
          const diceResult = await this.gameManager.playDice(ctx, diceValue);
          if (diceResult.success) {
            await ctx.reply(
              formatUserMessage(ctx, diceResult.message),
              Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Play Dice Again', `play_again_Dice_u${uid}`), Markup.button.callback('🎮 Other Games', `play_u${uid}`)],
                [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
              ])
            );
          } else {
            await ctx.reply(formatUserMessage(ctx, diceResult.message));
          }
          this.gameManager.clearSession(ctx);
        }, 4000);
        break;
      }
      case 'Coinflip': {
        ctx.session.awaitingGuess = true;
        await ctx.reply(
          formatUserMessage(ctx, '🪙 **Coinflip Game Ready!**\n\nChoose your side:'),
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[Markup.button.callback('🪙 Heads', `coinflip_heads_u${uid}`), Markup.button.callback('🪙 Tails', `coinflip_tails_u${uid}`)]])
          }
        );
        break;
      }
      case 'Bowling': {
        const bowlingMessage = await ctx.replyWithDice({ emoji: '🎳' });
        const bowlingValue = bowlingMessage.dice?.value || 1;
        setTimeout(async () => {
          const bowlingResult = await this.gameManager.playBowling(ctx, bowlingValue);
          if (bowlingResult.success) {
            await ctx.reply(
              formatUserMessage(ctx, bowlingResult.message),
              Markup.inlineKeyboard([
                [Markup.button.callback('🎳 Play Bowling Again', `play_again_Bowling_u${uid}`), Markup.button.callback('🎮 Other Games', `play_u${uid}`)],
                [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
              ])
            );
          } else {
            await ctx.reply(formatUserMessage(ctx, bowlingResult.message));
          }
          this.gameManager.clearSession(ctx);
        }, 4000);
        break;
      }
    }
  }

  async handleCreateChallenge(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    const wager = ctx.session.wager;
    const uid = ctx.from?.id;
    if (!wager) {
      await ctx.reply(formatUserMessage(ctx, "Please pick a wager first."));
      return;
    }
    const challenge = await this.multiplayer.createChallenge(ctx, gameName, wager);
    await ctx.reply(
      formatUserMessage(ctx, `📣 Challenge created for ${gameName} at ${wager} ETH!\nChallenge #${challenge.id}. Waiting for an opponent...`),
      Markup.inlineKeyboard([
        [Markup.button.callback('🗒 View Open Challenges', `pvp_list_${gameName}`)],
        [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
      ])
    );
  }

  async handleListChallenges(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    const open = await this.multiplayer.listOpenChallenges(gameName);
    const uid = ctx.from?.id;
    if (open.length === 0) {
      await ctx.reply(`No open challenges for ${gameName} yet. Create one!`);
      return;
    }
    const rows = open.slice(0, 10).map((c) => [
      Markup.button.callback(
        `#${c.id} by @${c.creator.username || c.creator.telegramId} • ${c.wager} ETH`,
        `pvp_accept_${c.id}`
      )
    ]);
    rows.push([Markup.button.callback('🔙 Back', `play_u${uid}`)]);
    await ctx.reply(
      `Open challenges for ${gameName}:`,
      Markup.inlineKeyboard(rows)
    );
  }



  async handlePlayAgain(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    
    // Clear any existing session
    ctx.session = {};
    const uid = ctx.from?.id;
    
    // Start the game selection process again
    await this.handleGameSelection(ctx, gameName);
  }}