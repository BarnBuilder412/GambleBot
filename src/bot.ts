// src/bot.ts
import { Telegraf, Markup, Context, session } from "telegraf";
import { AppDataSource } from "./utils/db";
import { User } from "./entities/User";
import { Transaction, TransactionType } from "./entities/Transaction";
import { generateDepositAddress } from "./utils/wallet";
import { Dice } from "./games/Dice";
import { Coinflip } from "./games/Coinflip"; // implement similar to Dice
import { Bowling } from "./games/Bowling"; // implement similar

import * as qrcode from "qrcode";
import * as fs from "fs";
// import * as https from "https";
import * as http from "http";
import * as dotenv from "dotenv";
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN!;
const WEBHOOK_URL = process.env.WEBHOOK_URL!;
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT!, 10);
const WEBHOOK_CERT_PATH = process.env.WEBHOOK_CERT_PATH!;
const WEBHOOK_KEY_PATH = process.env.WEBHOOK_KEY_PATH!;

// Telegraf context augmentation to type ctx.session
declare module "telegraf" {
  interface Context {
    session: SessionData;
  }
}

interface SessionData {
  game?: string;
  wager?: number;
}

const bot = new Telegraf(BOT_TOKEN);

// Enable in-memory session
bot.use(session({ defaultSession: () => ({}) }));

// Games dictionary
const games = {
  Dice: new Dice(),
  Coinflip: new Coinflip(),
  Bowling: new Bowling(),
};

async function getOrCreateUser(ctx: Context) {
  const telegramId = ctx.from?.id!;
  const username = ctx.from?.username;

  let user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
  if (!user) {
    user = new User();
    user.telegramId = telegramId;
    user.username = username;
    user.balance = 0;
    user.bonusBalance = 0;
    await AppDataSource.manager.save(user);

    // Generate deposit address
    const depositAddress = generateDepositAddress(user.id);
    user.depositAddress = depositAddress;
    await AppDataSource.manager.save(user);
  }
  return user;
}

async function updateBalance(
  user: User,
  amount: number,
  type: TransactionType,
  description?: string
) {
  user.balance += amount;
  if (user.balance < -0.01) throw new Error("Insufficient balance.");

  const tx = new Transaction();
  tx.user = user;
  tx.amount = amount;
  tx.type = type;
  tx.description = description;

  await AppDataSource.manager.save([user, tx]);
}

bot.start(async (ctx) => {
console.log("start");
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  
  const user = await getOrCreateUser(ctx);

  await ctx.reply(
    `Welcome, ${ctx.from?.first_name}!\nBalance: ${user.balance.toFixed(
      4
    )} ETH`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🎲 Play", "play")],
      [Markup.button.callback("💰 Deposit Address", "deposit")],
      [
        Markup.button.callback("🏧 Withdraw", "withdraw"),
        Markup.button.callback("🎁 Bonuses", "bonus"),
      ],
      [Markup.button.callback("⚙️ Settings", "settings")],
    ])
  );
});

bot.action("play", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "Choose a game:",
    Markup.inlineKeyboard(
      Object.keys(games).map((g) =>
        Markup.button.callback(g, "game_" + g)
      )
    )
  );
});

bot.action(/game_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const gameName = ctx.match?.[1];
  if (!gameName || !(gameName in games)) {
    await ctx.reply("Invalid game selected.");
    return;
  }

  ctx.session.game = gameName;
  await ctx.reply(`You selected ${gameName}. How much ETH do you want to wager?`);
  // If using scenes/wizard, set up proper Scenes; for now we manage state via session
  return;
});

// You'll want a scene here (using Telegraf Scenes) to query wager, then guess for dice/coinflip
// For brevity, core logic you can adapt similarly:
// - Save wager and game selection in session
// - Ask for guess if needed
// - Play the game after receiving user input
// - Update balance accordingly

bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx);

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
});

bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();
  // Implement withdrawal scene or prompt for amount + integration with wallet service
  await ctx.reply("Withdrawal functionality is not implemented in this example.");
});

bot.action("bonus", async (ctx) => {
  await ctx.answerCbQuery();

  const user = await getOrCreateUser(ctx);
  const bonus = user.balance * 0.05;
  if (bonus < 0.0001) {
    await ctx.reply("No bonus available. Deposit and play to earn bonuses!");
  } else {
    try {
      await updateBalance(user, bonus, TransactionType.BONUS, "5% bonus");
      await ctx.reply(
        `Bonus awarded: ${bonus.toFixed(4)} ETH\nNew balance: ${user.balance.toFixed(
          4
        )} ETH`
      );
    } catch (e) {
      await ctx.reply("Error applying bonus: " + e);
    }
  }
});

bot.action("settings", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx);
  await ctx.reply(
    `Settings:\nUsername: ${user.username}\nBalance: ${user.balance.toFixed(
      4
    )} ETH\nBonus Balance: ${user.bonusBalance.toFixed(4)} ETH\nDeposit Address: \`${user.depositAddress}\``,
    { parse_mode: "MarkdownV2" }
  );
});

// Launch bot
bot.launch()
    .then(() => {
        console.log(`🎰 GambleBot is running!`);
        console.log('🚀 Bot is ready to accept users!');
    })
    .catch((err) => {
        console.error('❌ Failed to start bot:', err);
        process.exit(1);
    });

// Enable graceful stop
process.once('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    bot.stop('SIGTERM');
}); 

// Setup HTTPS webhook server
(async () => {
  await AppDataSource.initialize();

  bot.telegram.setWebhook(WEBHOOK_URL);

  http.createServer(bot.webhookCallback("/telegram-webhook"))
  .listen(8443, () => {
      console.log("Bot listening on port 8443");
  });
})();