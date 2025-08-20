// src/handlers/WalletHandler.ts
import { Context, Markup } from "telegraf";
import { UserService } from "../services/UserService";
import { TransactionType } from "../entities/Transaction";
import { formatUserMessage, getUserDisplay } from "../utils/userDisplay";
import * as qrcode from "qrcode";
import { isAddress } from "ethers";

export class WalletHandler {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  async handleDeposit(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.userService.getOrCreateUser(ctx);

    // Generate QR code and send deposit address
    const depositAddress = user.depositAddress!;
    const qrCodeDataUrl = await qrcode.toDataURL(depositAddress);
    const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, "");

    const buffer = Buffer.from(base64Data, "base64");
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;
    if ((chatType === 'group' || chatType === 'supergroup') && userId) {
      try {
        // await ctx.reply("🔐 I've sent your deposit address in a private message.");
        await ctx.telegram.sendPhoto(
          userId,
          { source: buffer },
          { caption: `Your deposit Ethereum address:\n\`${depositAddress}\``, parse_mode: 'MarkdownV2' }
        );
      } catch (e) {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=deposit`;
        await ctx.reply(`Please open a private chat with me to view your deposit address: ${link}`);
      }
    } else {
      await ctx.replyWithPhoto(
        { source: buffer },
        {
          caption: `Your deposit Ethereum address:\n\`${depositAddress}\``,
          parse_mode: "MarkdownV2",
        }
      );
    }
  }

  async handleWithdraw(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();

    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;
    if ((chatType === 'group' || chatType === 'supergroup') && userId) {
      try {
        // await ctx.reply("🔐 I've sent you a private message to start your withdrawal.");
        await ctx.telegram.sendMessage(
          userId,
          '💰 Withdraw $\n\nPress the button below to start your private withdrawal flow:',
          Markup.inlineKeyboard([[Markup.button.callback('▶️ Start Withdrawal', `start_withdraw_u${userId}`)]] as any)
        );
      } catch (e) {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=withdraw`;
        await ctx.reply(`Please open a private chat with me to withdraw: ${link}`);
      }
      return;
    }

    await this.startWithdrawFlow(ctx);
  }

  async startWithdrawFlow(ctx: Context): Promise<void> {
    const user = await this.userService.getOrCreateUser(ctx);

    // Check if user has any balance to withdraw
    if (user.balance <= 0) {
      await ctx.reply(
        "❌ **Insufficient Balance**\n\nYou don't have any funds to withdraw.\nCurrent balance: $0.00",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Start withdrawal process
    ctx.session.withdrawStep = 'address';

    await ctx.reply(
      `💰 **Withdraw Funds**\n\nCurrent balance: $${user.balance.toFixed(2)}\n\n🔐 Please enter your Ethereum wallet address:\n\nExample: 0x742d35Cc6634C0532925a3b8D4C2E8e4C7...`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel Withdrawal', 'cancel_withdraw')]] as any)
      }
    );
  }

  async handleWithdrawAddressInput(ctx: Context, address: string): Promise<boolean> {
    // Validate Ethereum address
    if (!this.isValidEthereumAddress(address)) {
      await ctx.reply(
        "❌ **Invalid Ethereum Address**\n\nPlease enter a valid Ethereum address.\n\nExample: 0x742d35Cc6634C0532925a3b8D4C2E8e4C7...",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel Withdrawal', 'cancel_withdraw')]
          ])
        }
      );
      return true; // Handled, but invalid
    }

    // Address is valid, store it and ask for amount
    ctx.session.withdrawAddress = address;
    ctx.session.withdrawStep = 'amount';

    const user = await this.userService.getOrCreateUser(ctx);

    await ctx.reply(
      `✅ **Valid Address Confirmed**\n\n📍 Withdrawal address:\n${address}\n\n💰 Available balance: $${user.balance.toFixed(2)}\n\n💸 Enter withdrawal amount ($):`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('💰 Withdraw All', 'withdraw_all'),
            Markup.button.callback('💰 Withdraw Half', 'withdraw_half')
          ],
          [Markup.button.callback('❌ Cancel Withdrawal', 'cancel_withdraw')]
        ])
      }
    );

    return true; // Successfully handled
  }

  async handleWithdrawAmountInput(ctx: Context, amountText: string): Promise<boolean> {
    const amount = parseFloat(amountText);
    const user = await this.userService.getOrCreateUser(ctx);

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(
        "❌ **Invalid Amount**\n\nPlease enter a valid withdrawal amount.\n\nExample: 25",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('💰 Withdraw All', 'withdraw_all'),
              Markup.button.callback('💰 Withdraw Half', 'withdraw_half')
            ],
            [Markup.button.callback('❌ Cancel Withdrawal', 'cancel_withdraw')]
          ])
        }
      );
      return true; // Handled, but invalid
    }

    // Check if user has sufficient balance
    if (amount > user.balance) {
      await ctx.reply(
        `❌ **Insufficient Balance**\n\nRequested: $${amount.toFixed(2)}\nAvailable: $${user.balance.toFixed(2)}\n\nPlease enter a smaller amount.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('💰 Withdraw All', 'withdraw_all'),
              Markup.button.callback('💰 Withdraw Half', 'withdraw_half')
            ],
            [Markup.button.callback('❌ Cancel Withdrawal', 'cancel_withdraw')]
          ])
        }
      );
      return true; // Handled, but insufficient
    }

    // Process withdrawal
    await this.processWithdrawal(ctx, amount);
    return true;
  }

  async handleWithdrawAll(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.userService.getOrCreateUser(ctx);
    await this.processWithdrawal(ctx, user.balance);
  }

  async handleWithdrawHalf(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.userService.getOrCreateUser(ctx);
    const halfAmount = user.balance / 2;
    await this.processWithdrawal(ctx, halfAmount);
  }

  async handleCancelWithdraw(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();

    // Clear withdrawal session
    ctx.session.withdrawStep = undefined;
    ctx.session.withdrawAddress = undefined;

    await ctx.reply(
      "❌ **Withdrawal Cancelled**\n\nYour withdrawal request has been cancelled.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Main Menu', `main_menu_u${ctx.from?.id}`)]
        ])
      }
    );
  }

  private async processWithdrawal(ctx: Context, amount: number): Promise<void> {
    const user = await this.userService.getOrCreateUser(ctx);
    const address = ctx.session.withdrawAddress!;

    try {
      // Deduct amount from user balance
      await this.userService.updateBalance(user, -amount, TransactionType.WITHDRAW, `Withdrawal to ${address}`);

      // Clear withdrawal session
      ctx.session.withdrawStep = undefined;
      ctx.session.withdrawAddress = undefined;

      await ctx.reply(
        formatUserMessage(ctx, `✅ **Withdrawal Processed**\n\n💰 Amount: $${amount.toFixed(2)}\n📍 To address: ${address}\n\n💳 New balance: $${(user.balance - amount).toFixed(2)}\n\n⏳ Your withdrawal will be processed within 24 hours.`),
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Main Menu', `main_menu_u${ctx.from?.id}`)]
          ])
        }
      );

    } catch (error) {
      await ctx.reply(
        formatUserMessage(ctx, "❌ **Withdrawal Failed**\n\nThere was an error processing your withdrawal. Please try again later."),
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Main Menu', `main_menu_u${ctx.from?.id}`)]
          ])
        }
      );
    }
  }

  private isValidEthereumAddress(address: string): boolean {
    try {
      return isAddress(address);
    } catch (error) {
      return false;
    }
  }
} 