// src/handlers/WalletHandler.ts
import { Context } from "telegraf";
import { UserService } from "../services/UserService";
import { TransactionType } from "../entities/Transaction";
import * as qrcode from "qrcode";

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
    await ctx.replyWithPhoto(
      { source: buffer },
      {
        caption: `Your deposit Ethereum address:\n\`${depositAddress}\``,
        parse_mode: "MarkdownV2",
      }
    );
  }

  async handleWithdraw(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    // Implement withdrawal scene or prompt for amount + integration with wallet service
    await ctx.reply("Withdrawal functionality is not implemented in this example.");
  }


} 