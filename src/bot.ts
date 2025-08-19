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
  withdrawStep?: 'address' | 'amount';
  withdrawAddress?: string;
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

// PvE or PvP choices after wager
bot.action(/pve_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  if (gameName) {
    await menuHandler.handlePlayVsBot(ctx, gameName);
  }
});

bot.action(/pvp_create_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  if (gameName) {
    await menuHandler.handleCreateChallenge(ctx, gameName);
  }
});

bot.action(/pvp_list_(.+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  if (gameName) {
    await menuHandler.handleListChallenges(ctx, gameName);
  }
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
    await ctx.reply(res.message);
    if (res.ok) {
      // Start the PvP game flow with both players' actions visible
      const { AppDataSource } = await import('./utils/db');
      const { Challenge } = await import('./entities/Challenge');
      const repo = AppDataSource.getRepository(Challenge);
      const ch = await repo.findOne({ where: { id: challengeId }, relations: ['creator', 'opponent'] });
      if (!ch || !ch.opponent) return;

      const creatorUser = ch.creator;
      const opponentUser = ch.opponent!;
      const creatorId = creatorUser.telegramId;
      const opponentId = opponentUser.telegramId;
      const display = (u: { username?: string | null; telegramId: number }) =>
        u.username ? `@${u.username}` : `${u.telegramId}`;

      if (ch.game === 'Dice') {
        // Inform both players
        await ctx.telegram.sendMessage(creatorId, `🎲 PvP Dice vs ${display(opponentUser)}! Rolling dice for both players...`);
        await ctx.telegram.sendMessage(opponentId, `🎲 PvP Dice vs ${display(creatorUser)}! Rolling dice for both players...`);

        // Roll for both players so each sees their own animation
        const creatorRollMsg = await ctx.telegram.sendDice(creatorId, { emoji: '🎲' });
        const opponentRollMsg = await ctx.telegram.sendDice(opponentId, { emoji: '🎲' });
        const creatorRoll = creatorRollMsg.dice?.value || 1;
        const opponentRoll = opponentRollMsg.dice?.value || 1;

        // Wait for animation
        setTimeout(async () => {
          if (creatorRoll === opponentRoll) {
            // Tie -> reroll up to 5 times; if still tied declare draw
            let tries = 0;
            let cVal = creatorRoll;
            let oVal = opponentRoll;
            while (tries < 5 && cVal === oVal) {
              const tieNote = `🤝 Tie (${cVal} vs ${oVal})! Rerolling...`;
              await ctx.telegram.sendMessage(creatorId, tieNote);
              await ctx.telegram.sendMessage(opponentId, tieNote);
              const cMsg = await ctx.telegram.sendDice(creatorId, { emoji: '🎲' });
              const oMsg = await ctx.telegram.sendDice(opponentId, { emoji: '🎲' });
              cVal = cMsg.dice?.value || 1;
              oVal = oMsg.dice?.value || 1;
              tries++;
            }
            setTimeout(async () => {
              if (cVal === oVal) {
                const drawMsg = `🤝 Draw after ${tries+1} rolls! No payout. Your wagers are returned.`;
                await ctx.telegram.sendMessage(creatorId, drawMsg);
                await ctx.telegram.sendMessage(opponentId, drawMsg);
                await mp.completeDraw(ch.id);
              } else {
                const winnerId = cVal > oVal ? creatorId : opponentId;
                const summary = `Result: ${display(creatorUser)} rolled ${cVal} • ${display(opponentUser)} rolled ${oVal}\n🏆 Winner: ${winnerId === creatorId ? display(creatorUser) : display(opponentUser)}\n💰 Payout: ${(ch.wager*2).toFixed(4)} ETH`;
                await ctx.telegram.sendMessage(creatorId, summary);
                await ctx.telegram.sendMessage(opponentId, summary);
                await mp.settlePvpGame(ctx, ch.id, winnerId);
              }
            }, 4000);
          } else {
            const winnerId = creatorRoll > opponentRoll ? creatorId : opponentRoll > creatorRoll ? opponentId : Math.random() < 0.5 ? creatorId : opponentId;
            const summary = `Result: ${display(creatorUser)} rolled ${creatorRoll} • ${display(opponentUser)} rolled ${opponentRoll}\n🏆 Winner: ${winnerId === creatorId ? display(creatorUser) : display(opponentUser)}\n💰 Payout: ${(ch.wager*2).toFixed(4)} ETH`;
            await ctx.telegram.sendMessage(creatorId, summary);
            await ctx.telegram.sendMessage(opponentId, summary);
            await mp.settlePvpGame(ctx, ch.id, winnerId);
          }
        }, 4000);
      } else if (ch.game === 'Bowling') {
        await ctx.telegram.sendMessage(creatorId, `🎳 PvP Bowling vs ${display(opponentUser)}! Rolling for both players...`);
        await ctx.telegram.sendMessage(opponentId, `🎳 PvP Bowling vs ${display(creatorUser)}! Rolling for both players...`);

        const creatorRollMsg = await ctx.telegram.sendDice(creatorId, { emoji: '🎳' });
        const opponentRollMsg = await ctx.telegram.sendDice(opponentId, { emoji: '🎳' });
        const creatorTelegramVal = creatorRollMsg.dice?.value || 1;
        const opponentTelegramVal = opponentRollMsg.dice?.value || 1;

        const mapPins = (v: number) => ({ 1:0, 2:3, 3:5, 4:7, 5:9, 6:10 } as Record<number, number>)[v] || 0;
        const creatorPins = mapPins(creatorTelegramVal);
        const opponentPins = mapPins(opponentTelegramVal);

        setTimeout(async () => {
          if (creatorPins === opponentPins) {
            // Tie -> reroll up to 5 times; if still tied declare draw
            let tries = 0;
            let cPins = creatorPins;
            let oPins = opponentPins;
            while (tries < 5 && cPins === oPins) {
              const tieNote = `🤝 Tie (${cPins} vs ${oPins})! Rerolling...`;
              await ctx.telegram.sendMessage(creatorId, tieNote);
              await ctx.telegram.sendMessage(opponentId, tieNote);
              const cMsg2 = await ctx.telegram.sendDice(creatorId, { emoji: '🎳' });
              const oMsg2 = await ctx.telegram.sendDice(opponentId, { emoji: '🎳' });
              cPins = mapPins(cMsg2.dice?.value || 1);
              oPins = mapPins(oMsg2.dice?.value || 1);
              tries++;
            }
            setTimeout(async () => {
              if (cPins === oPins) {
                const drawMsg = `🤝 Draw after ${tries+1} rolls! No payout. Your wagers are returned.`;
                await ctx.telegram.sendMessage(creatorId, drawMsg);
                await ctx.telegram.sendMessage(opponentId, drawMsg);
                await mp.completeDraw(ch.id);
              } else {
                const winnerId = cPins > oPins ? creatorId : opponentId;
                const summary = `Result: ${display(creatorUser)} knocked ${cPins}/10 • ${display(opponentUser)} knocked ${oPins}/10\n🏆 Winner: ${winnerId === creatorId ? display(creatorUser) : display(opponentUser)}\n💰 Payout: ${(ch.wager*2).toFixed(4)} ETH`;
                await ctx.telegram.sendMessage(creatorId, summary, { parse_mode: 'Markdown' });
                await ctx.telegram.sendMessage(opponentId, summary, { parse_mode: 'Markdown' });
                await mp.settlePvpGame(ctx, ch.id, winnerId);
              }
            }, 4000);
          } else {
            const winnerId = creatorPins > opponentPins ? creatorId : opponentPins > creatorPins ? opponentId : Math.random() < 0.5 ? creatorId : opponentId;
            const summary = `Result: ${display(creatorUser)} knocked ${creatorPins}/10 • ${display(opponentUser)} knocked ${opponentPins}/10\n🏆 Winner: ${winnerId === creatorId ? display(creatorUser) : display(opponentUser)}\n💰 Payout: ${(ch.wager*2).toFixed(4)} ETH`;
            await ctx.telegram.sendMessage(creatorId, summary, { parse_mode: 'Markdown' });
            await ctx.telegram.sendMessage(opponentId, summary, { parse_mode: 'Markdown' });
            await mp.settlePvpGame(ctx, ch.id, winnerId);
          }
        }, 4000);
      } else if (ch.game === 'Coinflip') {
        const creatorSide = 'heads';
        const opponentSide = 'tails';
        const intro = `🪙 PvP Coinflip! ${display(creatorUser)} = HEADS, ${display(opponentUser)} = TAILS. Flipping...`;
        await ctx.telegram.sendMessage(creatorId, intro);
        await ctx.telegram.sendMessage(opponentId, intro);
        // Animate simple flip
        const resultIsHeads = Math.random() < 0.5;
        const resultText = resultIsHeads ? 'HEADS' : 'TAILS';
        const winnerId = resultIsHeads ? creatorId : opponentId;
        const summary = `Result: ${resultText}\n🏆 Winner: ${winnerId === creatorId ? display(creatorUser) : display(opponentUser)}\n💰 Payout: ${(ch.wager*2).toFixed(4)} ETH`;
        await ctx.telegram.sendMessage(creatorId, summary, { parse_mode: 'Markdown' });
        await ctx.telegram.sendMessage(opponentId, summary, { parse_mode: 'Markdown' });
        await mp.settlePvpGame(ctx, ch.id, winnerId);
      }
    }
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