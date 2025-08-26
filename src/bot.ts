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
import { MultiplayerService } from "./services/MultiplayerService";
import { PvPGameService } from "./services/PvPGameService";
import { formatUserMessage } from "./utils/userDisplay";
import { CommandHandler } from "./handlers/CommandHandler";
import { Markup } from "telegraf";
import { deleteMessageInGroup } from "./utils/messageCleanup";

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
  awaitingWager?: boolean;
  withdrawStep?: 'address' | 'amount';
  withdrawAddress?: string;
}

const bot = new Telegraf(BOT_TOKEN);

// Enable in-memory session (per user per chat) for group-safe state
bot.use(session({
  defaultSession: () => ({}),
  getSessionKey: (ctx) => {
    const fromId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (fromId && chatId) return `${chatId}:${fromId}`;
    if (fromId) return `${fromId}`;
    return undefined;
  }
}));
// Group-friendly command to start playing
bot.command('play', async (ctx) => {
  await menuHandler.handleStart(ctx);
});

// New quick game commands with amount
bot.command('dice', async (ctx) => {
  await commandHandler.handleQuickGameCommand(ctx, 'Dice');
});

bot.command('bowling', async (ctx) => {
  await commandHandler.handleQuickGameCommand(ctx, 'Bowling');
});

bot.command('coinflip', async (ctx) => {
  await commandHandler.handleQuickGameCommand(ctx, 'Coinflip');
});

// Quick balance check command
bot.command('balance', async (ctx) => {
  await commandHandler.handleBalanceCommand(ctx);
});

// Game history command
bot.command('history', async (ctx) => {
  await commandHandler.handleHistoryCommand(ctx);
});

// Onchain transaction history command
bot.command('transactions', async (ctx) => {
  await commandHandler.handleOnchainCommand(ctx);
});

// Quick deposit command
bot.command('deposit', async (ctx) => {
  await commandHandler.handleDepositCommand(ctx);
});

// Quick withdraw command
bot.command('withdraw', async (ctx) => {
  await commandHandler.handleWithdrawCommand(ctx);
});

// Initialize services and handlers
const userService = new UserService();
const multiplayerService = new MultiplayerService(userService);
const pvpGameService = new PvPGameService(userService, multiplayerService);
const gameManager = new GameManager(userService, pvpGameService);
const menuHandler = new MenuHandler(userService, gameManager, pvpGameService);
const walletHandler = new WalletHandler(userService);
const gameHandler = new GameHandler(gameManager);
const commandHandler = new CommandHandler(userService, gameManager);

// Guard: ensure callback button is used by the intended user
const ensureOwner = async (ctx: any, expectedUserIdStr: string) => {
  const expected = parseInt(expectedUserIdStr, 10);
  if (!ctx.from || ctx.from.id !== expected) {
    await ctx.answerCbQuery('This button is not for you');
    return false;
    }
  return true;
};

// Bot command and action handlers
bot.start(async (ctx) => {
  console.log("start");
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  await menuHandler.handleStart(ctx);
});

bot.action(/play_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await menuHandler.handlePlay(ctx);
  await deleteMessageInGroup(ctx);
});

bot.action(/game_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handleGameSelection(ctx, gameName);
  }
  await deleteMessageInGroup(ctx);
});

bot.action(/deposit_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await walletHandler.handleDeposit(ctx);
  await deleteMessageInGroup(ctx);
});

bot.action(/withdraw_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await walletHandler.handleWithdraw(ctx);
  await deleteMessageInGroup(ctx);
});

bot.action(/settings_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await menuHandler.handleSettings(ctx);
  await deleteMessageInGroup(ctx);
});

bot.action("dice_rules", async (ctx) => {
  await menuHandler.handleDiceRules(ctx);
  await deleteMessageInGroup(ctx);
});

bot.action("bowling_rules", async (ctx) => {
  await menuHandler.handleBowlingRules(ctx);
  await deleteMessageInGroup(ctx);
});

bot.action("coinflip_rules", async (ctx) => {
  await menuHandler.handleCoinflipRules(ctx);
  await deleteMessageInGroup(ctx);
});

// Handle "Play Again" buttons
bot.action(/play_again_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handlePlayAgain(ctx, gameName);
  }
});

// Handle "Main Menu" button
bot.action(/main_menu_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await ctx.answerCbQuery();
  await menuHandler.handleStart(ctx);
});

// Handle wager selection buttons
bot.action(/wager_(.+)_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const wagerAmount = ctx.match?.[2];
  const uid = ctx.match?.[3];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName && wagerAmount) {
    await menuHandler.handleWagerSelection(ctx, gameName, wagerAmount);
  }
  await deleteMessageInGroup(ctx);
});

// PvE or PvP choices after wager
bot.action(/pve_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handlePlayVsBot(ctx, gameName);
  }
  await deleteMessageInGroup(ctx);
});

bot.action(/pvp_create_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handleCreateChallenge(ctx, gameName);
  }
  await deleteMessageInGroup(ctx);
});

// pvp_list is intentionally open so others can discover challenges
bot.action(/pvp_list_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  if (gameName) {
    await menuHandler.handleListChallenges(ctx, gameName);
  }
  await deleteMessageInGroup(ctx);
});

bot.action(/pvp_accept_(\d+)/, async (ctx) => {
  const challengeId = parseInt(ctx.match?.[1] || '0', 10);
  if (!Number.isNaN(challengeId)) {
    // Lazy import to avoid cycles
    const { MultiplayerService } = await import('./services/MultiplayerService');
    const { UserService } = await import('./services/UserService');
    const mp = new MultiplayerService(new UserService());
    const res = await mp.acceptChallenge(ctx, challengeId);
    await ctx.answerCbQuery();
    await ctx.reply(formatUserMessage(ctx, res.message));
    if (res.ok) {
      // Start the PvP game flow with both players' actions visible
      const { AppDataSource } = await import('./utils/db');
      const { Challenge } = await import('./entities/Challenge');
      const repo = AppDataSource.getRepository(Challenge);
      const ch = await repo.findOne({ where: { id: challengeId }, relations: ['creator', 'opponent'] });
      if (!ch || !ch.opponent) return;



      if (ch.game === 'Dice') {
        await pvpGameService.handlePvPDice(ctx, ch);
      } else if (ch.game === 'Bowling') {
        await pvpGameService.handlePvPBowling(ctx, ch);
      } else if (ch.game === 'Coinflip') {
        await pvpGameService.handlePvPCoinflip(ctx, ch);
      }
    }
    await deleteMessageInGroup(ctx);
  }
});

// Handle withdrawal buttons
bot.action('withdraw_all', async (ctx) => {
  await walletHandler.handleWithdrawAll(ctx);
});

bot.action('withdraw_half', async (ctx) => {
  await walletHandler.handleWithdrawHalf(ctx);
});

bot.action('cancel_withdraw', async (ctx) => {
  await walletHandler.handleCancelWithdraw(ctx);
});

bot.action('deposit_chain_eth_sepolia', async (ctx) => {
  await walletHandler.handleDepositChainEthSepolia(ctx);
});

// Handle history button action
bot.action(/show_history_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await ctx.answerCbQuery();
  await commandHandler.handleHistoryCommand(ctx, 1, true); // isEdit = true for button action
  await deleteMessageInGroup(ctx);
});

// Handle history pagination
bot.action(/history_page_(\d+)_u(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match?.[1] || '1', 10);
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  await ctx.answerCbQuery();
  await commandHandler.handleHistoryCommand(ctx, page, true); // isEdit = true for pagination
});

// Handle onchain history button action
bot.action(/show_transactions_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await ctx.answerCbQuery();
  await commandHandler.handleOnchainCommand(ctx, 1, true); // isEdit = true for button action
  await deleteMessageInGroup(ctx);
});

// Handle onchain pagination
bot.action(/transactions_page_(\d+)_u(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match?.[1] || '1', 10);
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  await ctx.answerCbQuery();
  await commandHandler.handleOnchainCommand(ctx, page, true); // isEdit = true for pagination
});

// Listen for text input (wager, withdrawal address, withdrawal amount)
bot.on('text', async (ctx) => {
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text;

    // Handle withdrawal address input
    if (ctx.session.withdrawStep === 'address') {
      const handled = await walletHandler.handleWithdrawAddressInput(ctx, text);
      if (handled) return;
    }

    // Handle withdrawal amount input
    if (ctx.session.withdrawStep === 'amount') {
      const handled = await walletHandler.handleWithdrawAmountInput(ctx, text);
      if (handled) return;
    }

    // Handle wager input for game commands
    if (ctx.session.awaitingWager) {
      const handled = await commandHandler.handleWagerResponse(ctx, text);
      if (handled) return;
    }

    // Fallback to original wager input handler (for backward compatibility)
    const handled = await gameHandler.handleWagerInput(ctx);
    // If not handled by game handler, could add other text handlers here
  }
});

// Handle dice guess (legacy - no longer used since dice is automatic)
bot.action(/dice_guess_(\d)/, async (ctx) => {
  const guess = parseInt(ctx.match[1], 10);
  await gameHandler.handleDiceGuess(ctx, guess);
});

// Handle coinflip guess (guarded per user)
bot.action(/coinflip_heads_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await gameHandler.handleCoinflipGuess(ctx, 'heads');
  await deleteMessageInGroup(ctx);
});

bot.action(/coinflip_tails_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await gameHandler.handleCoinflipGuess(ctx, 'tails');
  await deleteMessageInGroup(ctx);
});

// Handle single player dice number selection
bot.action(/single_dice_(\d)_u(\d+)/, async (ctx) => {
  const selectedNumber = parseInt(ctx.match?.[1] || '1', 10);
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  
  await ctx.answerCbQuery();
  const result = await gameManager.playSinglePlayerDice(ctx, selectedNumber);
  await deleteMessageInGroup(ctx);
  
  // Wait for dice animation to complete (4 seconds)
  setTimeout(async () => {
    if (result.success) {
      await ctx.reply(
        formatUserMessage(ctx, result.message),
        Markup.inlineKeyboard([
          [Markup.button.callback('🎲 Play Dice Again', `play_again_Dice_u${uid}`), Markup.button.callback('🎮 Other Games', `play_u${uid}`)],
          [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
        ])
      );
    } else {
      await ctx.reply(formatUserMessage(ctx, result.message));
    }
    gameManager.clearSession(ctx);
  }, 4000);
});

// Handle single player bowling number selection
bot.action(/single_bowling_(\d)_u(\d+)/, async (ctx) => {
  const selectedNumber = parseInt(ctx.match?.[1] || '1', 10);
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  
  await ctx.answerCbQuery();
  const result = await gameManager.playSinglePlayerBowling(ctx, selectedNumber);
  await deleteMessageInGroup(ctx);
  
  // Wait for bowling animation to complete (4 seconds)
  setTimeout(async () => {
    if (result.success) {
      await ctx.reply(
        formatUserMessage(ctx, result.message),
        Markup.inlineKeyboard([
          [Markup.button.callback('🎳 Play Bowling Again', `play_again_Bowling_u${uid}`), Markup.button.callback('🎮 Other Games', `play_u${uid}`)],
          [Markup.button.callback('🏠 Main Menu', `main_menu_u${uid}`)]
        ])
      );
    } else {
      await ctx.reply(formatUserMessage(ctx, result.message));
    }
    gameManager.clearSession(ctx);
  }, 4000);
});

// Handle single player game selection (this should come AFTER the specific handlers)
bot.action(/single_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handleSinglePlayer(ctx, gameName);
  }
  await deleteMessageInGroup(ctx);
});

// Utility: Retry async function with exponential backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }
      console.error(`Attempt ${attempt} failed: ${err instanceof Error ? err.message : err}. Retrying in ${delay / 1000}s...`);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

// Launch bot with retry/backoff
retryWithBackoff(() => bot.launch(), 5, 2000)
  .then(() => {
    console.log(`🎰 GambleBot is running!`);
    console.log('🚀 Bot is ready to accept users!');
  })
  .catch((err) => {
    console.error('❌ Failed to start bot after retries:', err);
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

// Setup HTTPS webhook server with retry/backoff for setWebhook
(async () => {
  await AppDataSource.initialize();

  await retryWithBackoff(() => bot.telegram.setWebhook(WEBHOOK_URL), 5, 2000);

  http.createServer(bot.webhookCallback("/telegram-webhook"))
    .listen(8443, () => {
      console.log("Bot listening on port 8443");
    });
})();