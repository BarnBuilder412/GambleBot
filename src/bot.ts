// src/bot.ts
import { Telegraf, session } from "telegraf";
import { AppDataSource } from "./utils/db";
import * as http from "http";
import * as dotenv from "dotenv";

// Import modular services and handlers
import { UserService } from "./services/UserService";
import { GameManager } from "./services/GameManager";
import { MenuHandler } from "./handlers/MenuHandler";
import { WalletHandler } from "./handlers/WalletHandler";
import { GameHandler } from "./handlers/GameHandler";

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
  awaitingGuess?: boolean;
}

const bot = new Telegraf(BOT_TOKEN);

// Enable in-memory session
bot.use(session({ defaultSession: () => ({}) }));

// Initialize services and handlers
const userService = new UserService();
const gameManager = new GameManager(userService);
const menuHandler = new MenuHandler(userService, gameManager);
const walletHandler = new WalletHandler(userService);
const gameHandler = new GameHandler(gameManager);

// Bot command and action handlers
bot.start(async (ctx) => {
console.log("start");
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  
  await menuHandler.handleStart(ctx);
});

bot.action("play", async (ctx) => {
  await menuHandler.handlePlay(ctx);
});

bot.action(/game_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  if (gameName) {
    await menuHandler.handleGameSelection(ctx, gameName);
  }
});

bot.action("deposit", async (ctx) => {
  await walletHandler.handleDeposit(ctx);
});

bot.action("withdraw", async (ctx) => {
  await walletHandler.handleWithdraw(ctx);
});

bot.action("settings", async (ctx) => {
  await menuHandler.handleSettings(ctx);
});

bot.action("dice_rules", async (ctx) => {
  await menuHandler.handleDiceRules(ctx);
});

bot.action("bowling_rules", async (ctx) => {
  await menuHandler.handleBowlingRules(ctx);
});

bot.action("coinflip_rules", async (ctx) => {
  await menuHandler.handleCoinflipRules(ctx);
});

// Handle "Play Again" buttons
bot.action(/play_again_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  if (gameName) {
    await menuHandler.handlePlayAgain(ctx, gameName);
  }
});

// Handle "Main Menu" button
bot.action("main_menu", async (ctx) => {
  await ctx.answerCbQuery();
  await menuHandler.handleStart(ctx);
});

// Handle wager selection buttons
bot.action(/wager_(.+)_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const wagerAmount = ctx.match?.[2];
  if (gameName && wagerAmount) {
    await menuHandler.handleWagerSelection(ctx, gameName, wagerAmount);
  }
});



// Listen for wager input after game selection
bot.on('text', async (ctx) => {
  // Fallback to original wager input handler (for backward compatibility)
  const handled = await gameHandler.handleWagerInput(ctx);
  // If not handled by game handler, could add other text handlers here
});

// Handle dice guess (legacy - no longer used since dice is automatic)
bot.action(/dice_guess_(\d)/, async (ctx) => {
  const guess = parseInt(ctx.match[1], 10);
  await gameHandler.handleDiceGuess(ctx, guess);
});

// Handle coinflip guess
bot.action('coinflip_heads', async (ctx) => {
  await gameHandler.handleCoinflipGuess(ctx, 'heads');
});

bot.action('coinflip_tails', async (ctx) => {
  await gameHandler.handleCoinflipGuess(ctx, 'tails');
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