// src/handlers/CommandHandler.ts
import { Context, Markup } from "telegraf";
import { UserService } from "../services/UserService";
import { GameManager } from "../services/GameManager";
import { formatUserMessage } from "../utils/userDisplay";
import { formatUsd } from "../utils/currency";
import { AppDataSource } from "../utils/db";
import { TransactionType } from "../entities/Transaction";

export class CommandHandler {
  private userService: UserService;
  private gameManager: GameManager;

  constructor(userService: UserService, gameManager: GameManager) {
    this.userService = userService;
    this.gameManager = gameManager;
  }

  async handleQuickGameCommand(ctx: Context, gameName: string): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const args = (ctx.message as any)?.text?.split(' ') || [];
    if (args.length < 2) {
      (ctx as any).session.game = gameName;
      (ctx as any).session.awaitingWager = true;
      await ctx.reply(
        formatUserMessage(ctx, `🎮 **${gameName}**\n\nPlease enter your wager amount:\n\nExample: 1 or $1`)
      );
      return;
    }

    const amountText = args[1].replace('$', '');
    const amount = parseFloat(amountText);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(
        formatUserMessage(ctx, `❌ Invalid amount!\n\nPlease enter a valid number.\nExample: /${gameName.toLowerCase()} 1`)
      );
      return;
    }

    await this.processGameWithAmount(ctx, gameName, amount);
  }

  async handleWagerResponse(ctx: Context, text: string): Promise<boolean> {
    if (!ctx.session.awaitingWager || !ctx.session.game) {
      return false;
    }

    const amountText = text.replace('$', '');
    const amount = parseFloat(amountText);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(
        formatUserMessage(ctx, `❌ Invalid amount!\n\nPlease enter a valid number.\nExample: 1 or $1`)
      );
      return true;
    }

    // Clear the awaiting state
    (ctx as any).session.awaitingWager = false;

    // Process the game with the provided amount
    await this.processGameWithAmount(ctx, ctx.session.game, amount);
    return true;
  }

  private async processGameWithAmount(ctx: Context, gameName: string, amount: number): Promise<void> {
    // Check if user has enough balance
    const user = await this.userService.getOrCreateUser(ctx);
    if (!await this.userService.hasEnoughBalance(user, amount)) {
      const currentBalance = user.balance;
      await ctx.reply(
        formatUserMessage(ctx, `❌ Insufficient balance!\n\nRequired: ${formatUsd(amount)}\nCurrent: ${formatUsd(currentBalance)}\n\nUse /deposit to add funds.`)
      );
      return;
    }

    // Set game and wager in session
    (ctx as any).session.game = gameName;
    (ctx as any).session.wager = amount;

    const uid = ctx.from?.id;

    // Show PvE/PvP selection
    await ctx.reply(
      formatUserMessage(ctx, `🎮 ${gameName} - ${formatUsd(amount)}\n\nChoose your game mode:`),
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🤖 Play vs Bot", `pve_${gameName}_u${uid}`),
          Markup.button.callback("👥 Challenge Player", `pvp_create_${gameName}_u${uid}`)
        ],
        [
          Markup.button.callback("🗒 View Open Challenges", `pvp_list_${gameName}`)
        ],
        [
          Markup.button.callback("📋 Game Rules", `${gameName.toLowerCase()}_rules`),
          Markup.button.callback("🔙 Main Menu", `main_menu_u${uid}`)
        ]
      ])
    );
  }

  async handleBalanceCommand(ctx: Context): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = await this.userService.getOrCreateUser(ctx);
    const freshUser = await this.userService.refreshUserBalance(user.id) || user;

    await ctx.reply(
      formatUserMessage(ctx, `💰 Your Balance: ${formatUsd(freshUser.balance)}`)
    );
  }

  async handleHistoryCommand(ctx: Context, page: number = 1, isEdit: boolean = false): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Check if user is in a group and redirect to private chat
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;

    if ((chatType === 'group' || chatType === 'supergroup') && userId && !isEdit) {
      try {
        await ctx.telegram.sendMessage(
          userId,
          '📊 **Game History**\n\nI\'ve sent your game history to this private chat for privacy.',
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("📊 View History", `show_history_u${userId}`)]
            ]).reply_markup
          }
        );
        await ctx.reply("📊 I've sent your game history to our private chat for privacy.");
      } catch (e) {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=history`;
        await ctx.reply(`📊 Please open a private chat with me to view your history: ${link}`);
      }
      return;
    }

    const user = await this.userService.getOrCreateUser(ctx);
    const limit = 10;
    const offset = (page - 1) * limit;

    // Get only game-related transactions (BET, WIN, WAGER, REFUND) - ALL of them, no limit
    const gameTransactionTypes = [TransactionType.BET, TransactionType.WIN, TransactionType.WAGER, TransactionType.REFUND];
    const transactions = await this.userService.getUserGameTransactionHistory(user.telegramId, limit, offset, gameTransactionTypes);
    const totalCount = await this.userService.getUserGameTransactionCount(user.telegramId, gameTransactionTypes);

    if (transactions.length === 0) {
      const message = page === 1
        ? "📊 No game history found.\n\nStart playing to see your game history!"
        : "📊 No more game history found.";

      if (isEdit) {
        await ctx.editMessageText(formatUserMessage(ctx, message), { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(formatUserMessage(ctx, message));
      }
      return;
    }

    const totalPages = Math.ceil(totalCount / limit);
    let historyText = `📊 **Game History** (Page ${page}/${totalPages})\n\n`;
    historyText += "```\n";
    historyText += "Game       | Status | Amount\n";
    historyText += "-----------|--------|--------\n";

    transactions.forEach((tx: any) => {
      const gameName = this.extractGameFromDescription(tx.description || '');
      const status = this.getGameStatus(tx.type);
      const amount = tx.amount > 0 ? `+${formatUsd(tx.amount)}` : formatUsd(tx.amount);

      // Format with proper spacing for alignment
      const gameCol = gameName.padEnd(10);
      const statusCol = status.padEnd(6);
      const amountCol = amount.padStart(8);

      historyText += `${gameCol} | ${statusCol} | ${amountCol}\n`;
    });

    historyText += "```";

    const uid = ctx.from?.id;

    // Create pagination buttons
    const buttons = [];
    const navButtons = [];

    if (page > 1) {
      navButtons.push(Markup.button.callback("⬅️ Previous", `history_page_${page - 1}_u${uid}`));
    }

    if (page < totalPages) {
      navButtons.push(Markup.button.callback("Next ➡️", `history_page_${page + 1}_u${uid}`));
    }

    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    buttons.push([Markup.button.callback("🔙 Main Menu", `main_menu_u${uid}`)]);

    const messageOptions = {
      parse_mode: 'Markdown' as const,
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    };

    if (isEdit) {
      // Edit the existing message for smooth pagination
      await ctx.editMessageText(formatUserMessage(ctx, historyText), messageOptions);
    } else {
      // Send new message for initial history command
      await ctx.reply(formatUserMessage(ctx, historyText), messageOptions);
    }
  }

  private extractGameFromDescription(description: string): string {
    if (description.toLowerCase().includes('dice')) return 'Dice';
    if (description.toLowerCase().includes('bowling')) return 'Bowling';
    if (description.toLowerCase().includes('coinflip')) return 'Coinflip';
    return 'Game';
  }

  async handleDepositCommand(ctx: Context): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Check if user is in a group and redirect to private chat
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;

    if ((chatType === 'group' || chatType === 'supergroup') && userId) {
      try {
        await ctx.telegram.sendMessage(
          userId,
          '💰 **Deposit Funds**\n\nI\'ve sent the deposit information to this private chat for security.',
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("💰 Get Deposit Address", `deposit_u${userId}`)]
            ]).reply_markup
          }
        );
        await ctx.reply("💰 I've sent deposit information to our private chat for security.");
      } catch (e) {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=deposit`;
        await ctx.reply(`💰 Please open a private chat with me to get your deposit address: ${link}`);
      }
      return;
    }

    // If already in private chat, show deposit options directly
    await ctx.reply(
      formatUserMessage(ctx, '💰 **Deposit Funds**\n\nSelect a chain for deposit:'),
      Markup.inlineKeyboard([
        [Markup.button.callback('Ethereum Sepolia', 'deposit_chain_eth_sepolia')],
        [Markup.button.callback('🔙 Main Menu', `main_menu_u${userId}`)]
      ])
    );
  }

  async handleWithdrawCommand(ctx: Context): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Check if user is in a group and redirect to private chat
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;

    if ((chatType === 'group' || chatType === 'supergroup') && userId) {
      try {
        await ctx.telegram.sendMessage(
          userId,
          '🏧 **Withdraw Funds**\n\nI\'ve sent the withdrawal interface to this private chat for security.',
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("🏧 Start Withdrawal", `withdraw_u${userId}`)]
            ]).reply_markup
          }
        );
        await ctx.reply("🏧 I've sent withdrawal interface to our private chat for security.");
      } catch (e) {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=withdraw`;
        await ctx.reply(`🏧 Please open a private chat with me to withdraw funds: ${link}`);
      }
      return;
    }

    // If already in private chat, check balance and start withdrawal
    const user = await this.userService.getOrCreateUser(ctx);
    const freshUser = await this.userService.refreshUserBalance(user.id) || user;

    if (freshUser.balance <= 0) {
      await ctx.reply(
        formatUserMessage(ctx, "❌ **Insufficient Balance**\n\nYou don't have any funds to withdraw.\nCurrent balance: $0.00"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Start withdrawal flow directly
    (ctx as any).session.withdrawStep = 'address';
    await ctx.reply(
      formatUserMessage(ctx, `🏧 **Withdraw Funds**\n\nCurrent Balance: ${formatUsd(freshUser.balance)}\n\nPlease enter your Ethereum address:`),
      { parse_mode: "Markdown" }
    );
  }

  async handleOnchainCommand(ctx: Context, page: number = 1, isEdit: boolean = false): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Check if user is in a group and redirect to private chat
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;

    if ((chatType === 'group' || chatType === 'supergroup') && userId && !isEdit) {
      try {
        await ctx.telegram.sendMessage(
          userId,
          '💰 **Onchain Transactions**\n\nI\'ve sent your transaction history to this private chat for privacy.',
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("💰 View Transactions", `show_transactions_u${userId}`)]
            ]).reply_markup
          }
        );
        await ctx.reply("💰 I've sent your onchain transaction history to our private chat for privacy.");
      } catch (e) {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=onchain`;
        await ctx.reply(`💰 Please open a private chat with me to view your onchain history: ${link}`);
      }
      return;
    }

    const user = await this.userService.getOrCreateUser(ctx);
    const limit = 10;
    const offset = (page - 1) * limit;

    // Get only onchain transactions (DEPOSIT, WITHDRAW)
    const transactionTypes = [TransactionType.DEPOSIT, TransactionType.WITHDRAW];
    const transactions = await this.userService.getUserGameTransactionHistory(user.telegramId, limit, offset, transactionTypes);
    const totalCount = await this.userService.getUserGameTransactionCount(user.telegramId, transactionTypes);

    if (transactions.length === 0) {
      const message = page === 1
        ? "💰 No transactions found.\n\nDeposit or withdraw to see your transaction history!"
        : "💰 No more transactions found.";

      if (isEdit) {
        await ctx.editMessageText(formatUserMessage(ctx, message), { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(formatUserMessage(ctx, message));
      }
      return;
    }

    const totalPages = Math.ceil(totalCount / limit);
    let historyText = `💰 **Transaction History** (Page ${page}/${totalPages})\n\n`;
    historyText += "```\n";
    historyText += "Action     | Amount\n";
    historyText += "-----------|--------\n";

    transactions.forEach((tx: any) => {
      const action = tx.type === TransactionType.DEPOSIT ? 'Deposit' : 'Withdraw';
      const amount = tx.amount > 0 ? `+${formatUsd(tx.amount)}` : formatUsd(tx.amount);

      // Format with proper spacing for alignment
      const actionCol = action.padEnd(10);
      const amountCol = amount.padStart(8);

      historyText += `${actionCol} | ${amountCol}\n`;
    });

    historyText += "```";

    const uid = ctx.from?.id;

    // Create pagination buttons
    const buttons = [];
    const navButtons = [];

    if (page > 1) {
      navButtons.push(Markup.button.callback("⬅️ Previous", `onchain_page_${page - 1}_u${uid}`));
    }

    if (page < totalPages) {
      navButtons.push(Markup.button.callback("Next ➡️", `onchain_page_${page + 1}_u${uid}`));
    }

    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    buttons.push([Markup.button.callback("🔙 Main Menu", `main_menu_u${uid}`)]);

    const messageOptions = {
      parse_mode: 'Markdown' as const,
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    };

    if (isEdit) {
      // Edit the existing message for smooth pagination
      await ctx.editMessageText(formatUserMessage(ctx, historyText), messageOptions);
    } else {
      // Send new message for initial onchain command
      await ctx.reply(formatUserMessage(ctx, historyText), messageOptions);
    }
  }

  private getGameStatus(type: TransactionType): string {
    switch (type) {
      case TransactionType.BET:
      case TransactionType.WAGER:
        return 'Bet';
      case TransactionType.WIN:
        return 'Win';
      case TransactionType.REFUND:
        return 'Refund';
      default:
        return 'Play';
    }
  }
} 