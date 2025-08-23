// src/handlers/MenuHandler.ts
import { Context, Markup } from "telegraf";
import { UserService } from "../services/UserService";
import { GameManager } from "../services/GameManager";
import { MultiplayerService } from "../services/MultiplayerService";
import { formatUserMessage, getUserDisplay } from "../utils/userDisplay";
import { formatUsd } from "../utils/currency";
import { AppDataSource } from "../utils/db";
import { Challenge } from "../entities/Challenge";

export class MenuHandler {
  private userService: UserService;
  private gameManager: GameManager;
  private multiplayer: MultiplayerService;
  private pvpGameService: any;

  constructor(userService: UserService, gameManager: GameManager, pvpGameService: any) {
    this.userService = userService;
    this.gameManager = gameManager;
    this.pvpGameService = pvpGameService;
    this.multiplayer = new MultiplayerService(userService);
  }

  async handleStart(ctx: Context): Promise<void> {
    // Always fetch the latest user from DB to get the most up-to-date balance
    const userFromSession = await this.userService.getOrCreateUser(ctx);
    const user = await this.userService.refreshUserBalance(userFromSession.id) || userFromSession;
    const uid = ctx.from?.id;
    const userDisplay = getUserDisplay(ctx);

    // Balance is tracked in USD
    const balanceUsd = user.balance;

    await ctx.reply(
      `Welcome, ${userDisplay}!\nBalance: ${formatUsd(balanceUsd)}`,
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
      formatUserMessage(ctx, "Choose a game:"),
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

    // Add view open challenges button
    wagerButtons.push([
      Markup.button.callback("🗒 View Open Challenges", `pvp_list_${gameName}`)
    ]);

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
    const userFromSession = await this.userService.getOrCreateUser(ctx);
    const user = await this.userService.refreshUserBalance(userFromSession.id) || userFromSession;
    const currentHandle = getUserDisplay(ctx);
    
    // Balance is tracked in USD
    const balanceUsd = user.balance;
    
    await ctx.reply(
      `⚙️ **Settings**\n\n👤 Current Handle: ${currentHandle}\n💰 Balance: ${formatUsd(balanceUsd)}\n📍 Deposit Address: \`${user.depositAddress}\``,
      { parse_mode: "Markdown" }
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
• **STRIKE (6 pins)**: 3x payout
• **Great Roll (4-5 pins)**: 1.5x payout  
• **Poor Roll (1-3 pins)**: You lose

💰 **Payouts:**
• Strike = 3x your wager
• Great Roll = 1.5x your wager
• Poor Roll = Loss

🎮 **Example:**
• Wager: $50
• Roll Strike (6 pins) → You win $150!
• Roll 5 pins → You win $75!
• Roll 2 pins → You lose your wager

🎳 **Pin Mapping:**
• Animation 6 = 6 pins (Strike! - 3x payout)
• Animation 5 = 5 pins (Great - 1.5x payout)
• Animation 4 = 4 pins (Great - 1.5x payout)
• Animation 3 = 3 pins (Loss)
• Animation 2 = 2 pins (Loss)
• Animation 1 = 1 pin (Loss)

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
    
    let wagerUsd: number;
    
    // Handle balance-based wagering
    if (wagerAmount === 'half' || wagerAmount === 'full') {
      const user = await this.userService.getOrCreateUser(ctx);
      
      if (wagerAmount === 'half') {
        wagerUsd = user.balance / 2;
      } else { // full
        wagerUsd = user.balance;
      }
      // Check if user has sufficient balance
      if (wagerUsd <= 0) {
        await ctx.reply(
          "❌ **Insufficient Balance**\n\nYou don't have enough funds to place this wager.\n\nPlease make a deposit first!",
          { parse_mode: "Markdown" }
        );
        return;
      }
    } else {
      // Wager entered directly in USD
      wagerUsd = parseFloat(wagerAmount);
      // Check if user has sufficient balance in USD
      const user = await this.userService.getOrCreateUser(ctx);
      if (user.balance < wagerUsd) {
        const userBalanceUsd = user.balance;
        await ctx.reply(
          `❌ **Insufficient Balance**\n\nWager: ${formatUsd(wagerUsd)}\nYour Balance: ${formatUsd(userBalanceUsd)}\n\nPlease deposit more funds or choose a smaller wager.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
    }
    
    ctx.session.game = gameName;
    ctx.session.wager = wagerUsd; // Store USD amount for game logic
    const uid = ctx.from?.id;
    
    await ctx.reply(
      formatUserMessage(ctx, `✅ Wager set: ${formatUsd(wagerUsd)} for ${gameName}\n\nChoose how to play:`),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🎮 Single Player', `single_${gameName}_u${uid}`),
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

    // Create a PvP challenge and assign the bot as the opponent
    try {
      const challenge = await this.multiplayer.createChallenge(ctx, gameName, wager);
      if (!challenge) {
        await ctx.reply(formatUserMessage(ctx, "❌ Failed to create challenge. Please try again."));
        return;
      }

      // Assign the bot as the opponent and mark as accepted
      // We'll use a special bot user with a fixed telegramId (e.g., 999999999)
      const botUser = await this.userService.getOrCreateBotUser();
      challenge.opponent = botUser;
      challenge.status = "accepted";
      // await (this.multiplayer as any).AppDataSource.getRepository(require("../entities/Challenge").Challenge).save(challenge);
      await AppDataSource.getRepository(Challenge).save(challenge);
      
      // Send invitation to the bot via PvPGameService
      if (this.pvpGameService && this.pvpGameService.botPlayerSocket && this.pvpGameService.botPlayerSocket.readyState === 1) {
        this.pvpGameService.botPlayerSocket.send(JSON.stringify({
          type: "invite",
          game: gameName,
          challengeId: challenge.id,
          wager: challenge.wager,
          opponent: {
            id: ctx.from?.id,
            username: ctx.from?.username || ctx.from?.first_name || "user"
          }
        }));
      }

      await ctx.reply(formatUserMessage(ctx, `🤖 Challenge created for ${gameName} at ${wager}! Playing against the bot...`));
      // Now trigger the PvP game logic as usual
      await this.gameManager.startPvPGameWithBot(ctx, challenge);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await ctx.reply(formatUserMessage(ctx, `❌ ${errorMessage}`));
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

    try {
      const challenge = await this.multiplayer.createChallenge(ctx, gameName, wager);
      if (!challenge) {
        await ctx.reply(formatUserMessage(ctx, "❌ Failed to create challenge. Please try again."));
        return;
      }

      const wagerDisplayUsd = wager;
      await ctx.reply(
        formatUserMessage(ctx, `📣 Challenge created for ${gameName} at ${formatUsd(wagerDisplayUsd)}!\nChallenge #${challenge.id}. Waiting for an opponent...`),
        Markup.inlineKeyboard([
          [Markup.button.callback('🗒 View Open Challenges', `pvp_list_${gameName}`)],
          [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
        ])
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await ctx.reply(
        formatUserMessage(ctx, `❌ ${errorMessage}`),
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
        ])
      );
    }
  }

  async handleListChallenges(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    const open = await this.multiplayer.listOpenChallenges(gameName);
    const uid = ctx.from?.id;
    if (open.length === 0) {
      await ctx.reply(`No open challenges for ${gameName} yet. Create one!`);
      return;
    }
    const rows = open.slice(0, 10).map((c) => {
      const wagerUsd = c.wager;
      return [
        Markup.button.callback(
          `#${c.id} by @${c.creator.username || c.creator.telegramId} • ${formatUsd(wagerUsd)}`,
          `pvp_accept_${c.id}`
        )
      ];
    });
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
  }

  async handleSinglePlayer(ctx: Context, gameName: string): Promise<void> {
    await ctx.answerCbQuery();
    const wager = ctx.session.wager;
    const uid = ctx.from?.id;
    if (!wager) {
      await ctx.reply(formatUserMessage(ctx, "Please pick a wager first."));
      return;
    }
    switch (gameName) {
      case 'Dice': {
        // Show number selection for single player dice
        await ctx.reply(
          formatUserMessage(ctx, `🎲 **Single Player Dice Game**\n\n💰 Wager: ${wager}\n🎯 Select a number (1-6):\n\nIf your number comes up, you win 5x your wager!`),
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('1️⃣', `single_dice_1_u${uid}`),
                Markup.button.callback('2️⃣', `single_dice_2_u${uid}`),
                Markup.button.callback('3️⃣', `single_dice_3_u${uid}`)
              ],
              [
                Markup.button.callback('4️⃣', `single_dice_4_u${uid}`),
                Markup.button.callback('5️⃣', `single_dice_5_u${uid}`),
                Markup.button.callback('6️⃣', `single_dice_6_u${uid}`)
              ],
              [Markup.button.callback('🔙 Back', `play_u${uid}`)]
            ])
          }
        );
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
        // Show number selection for single player bowling
        await ctx.reply(
          formatUserMessage(ctx, `🎳 **Single Player Bowling Game**\n\n💰 Wager: ${wager}\n🎯 Select a number (1-6):\n\nIf your number comes up, you win 5x your wager!`),
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('1️⃣', `single_bowling_1_u${uid}`),
                Markup.button.callback('2️⃣', `single_bowling_2_u${uid}`),
                Markup.button.callback('3️⃣', `single_bowling_3_u${uid}`)
              ],
              [
                Markup.button.callback('4️⃣', `single_bowling_4_u${uid}`),
                Markup.button.callback('5️⃣', `single_bowling_5_u${uid}`),
                Markup.button.callback('6️⃣', `single_bowling_6_u${uid}`)
              ],
              [Markup.button.callback('🔙 Back', `play_u${uid}`)]
            ])
          }
        );
        break;
      }
    }
  }
}