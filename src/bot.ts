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
import { getUserDisplayFromUserPlain } from "./utils/userDisplay";
import { formatUserMessage } from "./utils/userDisplay";
import { formatUsd } from "./utils/currency";

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

// Initialize services and handlers
const userService = new UserService();
const gameManager = new GameManager(userService);
const menuHandler = new MenuHandler(userService, gameManager);
const walletHandler = new WalletHandler(userService);
const gameHandler = new GameHandler(gameManager);

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
});

bot.action(/game_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handleGameSelection(ctx, gameName);
  }
});

bot.action(/deposit_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await walletHandler.handleDeposit(ctx);
});

bot.action(/withdraw_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await walletHandler.handleWithdraw(ctx);
});

bot.action(/settings_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
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
});

// PvE or PvP choices after wager
bot.action(/pve_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handlePlayVsBot(ctx, gameName);
  }
});

bot.action(/pvp_create_(.+)_u(\d+)/, async (ctx) => {
  const gameName = ctx.match?.[1];
  const uid = ctx.match?.[2];
  if (!(await ensureOwner(ctx, uid))) return;
  if (gameName) {
    await menuHandler.handleCreateChallenge(ctx, gameName);
  }
});

// pvp_list is intentionally open so others can discover challenges
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
    await ctx.reply(formatUserMessage(ctx, res.message));
    if (res.ok) {
      // Start the PvP game flow with both players' actions visible
      const { AppDataSource } = await import('./utils/db');
      const { Challenge } = await import('./entities/Challenge');
      const repo = AppDataSource.getRepository(Challenge);
      const ch = await repo.findOne({ where: { id: challengeId }, relations: ['creator', 'opponent'] });
      if (!ch || !ch.opponent) return;

      const creatorUser = ch.creator;
      const opponentUser = ch.opponent!;
      const groupChatId = ch.isGroup && ch.chatId ? ch.chatId : undefined;
      const chatA = groupChatId ?? creatorUser.telegramId; // message target for creator side
      const chatB = groupChatId ?? opponentUser.telegramId; // message target for opponent side
      const userAId = creatorUser.telegramId; // actual user telegramIds for settlement
      const userBId = opponentUser.telegramId;


      if (ch.game === 'Dice') {
        const intro = `🎲 PvP Dice: ${getUserDisplayFromUserPlain(creatorUser)} vs ${getUserDisplayFromUserPlain(opponentUser)}! Rolling dice for both players...`;
        await ctx.telegram.sendMessage(chatA, intro);
        // Send separate roll messages for each user in group
        if (groupChatId) {
          await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
          const creatorRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
          await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
          const opponentRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
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
                await ctx.telegram.sendMessage(groupChatId, tieNote);
                // Mention both users before reroll
                await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const cMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
                await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const oMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
                cVal = cMsg.dice?.value || 1;
                oVal = oMsg.dice?.value || 1;
                tries++;
              }
              setTimeout(async () => {
                if (cVal === oVal) {
                  const drawMsg = `🤝 Draw after ${tries+1} rolls! No payout. Your wagers are returned.`;
                  await ctx.telegram.sendMessage(groupChatId, drawMsg);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, drawMsg);
                  await mp.completeDraw(ch.id);
                } else {
                  const winnerUserId = cVal > oVal ? userAId : userBId;
                  const payoutUsd = ch.wager * 2;
                  const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} rolled ${cVal} • ${getUserDisplayFromUserPlain(opponentUser)} rolled ${oVal}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
                  await ctx.telegram.sendMessage(groupChatId, summary);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
                  await mp.settlePvpGame(ctx, ch.id, winnerUserId);
                }
              }, 4000);
            } else {
              const winnerUserId = creatorRoll > opponentRoll ? userAId : userBId;
              const payoutUsd = ch.wager * 2;
              const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} rolled ${creatorRoll} • ${getUserDisplayFromUserPlain(opponentUser)} rolled ${opponentRoll}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
              await ctx.telegram.sendMessage(groupChatId, summary);
              if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
              await mp.settlePvpGame(ctx, ch.id, winnerUserId);
            }
          }, 4000);
        } else {
          // Non-group PvP Dice logic
          const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎲' });
          const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎲' });
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
                await ctx.telegram.sendMessage(chatA, tieNote);
                // Mention user before reroll
                await ctx.telegram.sendMessage(chatA, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const cMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎲' });
                await ctx.telegram.sendMessage(chatB, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const oMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎲' });
                cVal = cMsg.dice?.value || 1;
                oVal = oMsg.dice?.value || 1;
                tries++;
              }
              setTimeout(async () => {
                if (cVal === oVal) {
                  const drawMsg = `🤝 Draw after ${tries+1} rolls! No payout. Your wagers are returned.`;
                  await ctx.telegram.sendMessage(chatA, drawMsg);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, drawMsg);
                  await mp.completeDraw(ch.id);
                } else {
                  const winnerUserId = cVal > oVal ? userAId : userBId;
                  const payoutUsd = ch.wager * 2;
                  const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} rolled ${cVal} • ${getUserDisplayFromUserPlain(opponentUser)} rolled ${oVal}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
                  await ctx.telegram.sendMessage(chatA, summary);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
                  await mp.settlePvpGame(ctx, ch.id, winnerUserId);
                }
              }, 4000);
            } else {
              const winnerUserId = creatorRoll > opponentRoll ? userAId : userBId;
              const payoutUsd = ch.wager * 2;
              const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} rolled ${creatorRoll} • ${getUserDisplayFromUserPlain(opponentUser)} rolled ${opponentRoll}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
              await ctx.telegram.sendMessage(chatA, summary);
              if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
              await mp.settlePvpGame(ctx, ch.id, winnerUserId);
            }
          }, 4000);
        }
      } else if (ch.game === 'Bowling') {
        const intro = `🎳 PvP Bowling: ${getUserDisplayFromUserPlain(creatorUser)} vs ${getUserDisplayFromUserPlain(opponentUser)}! Rolling for both players...`;
        await ctx.telegram.sendMessage(chatA, intro);
        if (groupChatId) {
          await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
          const creatorRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
          await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
          const opponentRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
          const creatorTelegramVal = creatorRollMsg.dice?.value || 1;
          const opponentTelegramVal = opponentRollMsg.dice?.value || 1;

          // Use the same mapping as Bowling.ts (0-6 pins)
          const mapPins = (v: number) => {
            const mapping = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
            return mapping[v as keyof typeof mapping] || 0;
          };
          const creatorPins = mapPins(creatorTelegramVal);
          const opponentPins = mapPins(opponentTelegramVal);

          // Use the same payout logic as Bowling.ts
          function getPayoutAndMsg(pins: number, wager: number) {
            if (pins === 6) {
              const winAmount = wager * 3;
              return { payout: winAmount, msg: `🎳 STRIKE! Win!\nPayout: ${formatUsd(winAmount)}. Pins Down: ${pins}` };
            } else if (pins >= 4 && pins <= 5) {
              const winAmount = wager * 1.5;
              return { payout: winAmount, msg: `🎉 Great Roll! Win!\nPayout: ${formatUsd(winAmount)}. Pins Down: ${pins}` };
            } else {
              return { payout: 0, msg: `😔 Poor Roll - Lose\nPayout: $0.00. Pins Down: ${pins}` };
            }
          }

          setTimeout(async () => {
            if (creatorPins === opponentPins) {
              // Tie -> reroll up to 5 times; if still tied declare draw
              let tries = 0;
              let cPins = creatorPins;
              let oPins = opponentPins;
              while (tries < 5 && cPins === oPins) {
                const tieNote = `🤝 Tie (${cPins} vs ${oPins})! Rerolling...`;
                await ctx.telegram.sendMessage(groupChatId, tieNote);
                // Mention both users before reroll
                await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const cMsg2 = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
                await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const oMsg2 = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
                cPins = mapPins(cMsg2.dice?.value || 1);
                oPins = mapPins(oMsg2.dice?.value || 1);
                tries++;
              }
              setTimeout(async () => {
                if (cPins === oPins) {
                  const drawMsg = `🤝 Draw after ${tries+1} rolls! No payout. Your wagers are returned.`;
                  await ctx.telegram.sendMessage(groupChatId, drawMsg);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, drawMsg);
                  await mp.completeDraw(ch.id);
                } else {
                  const winnerUserId = cPins > oPins ? userAId : userBId;
                  const winnerPins = cPins > oPins ? cPins : oPins;
                  const loserPins = cPins > oPins ? oPins : cPins;
                  const winnerUser = cPins > oPins ? creatorUser : opponentUser;
                  const loserUser = cPins > oPins ? opponentUser : creatorUser;
                  const winnerMsg = getPayoutAndMsg(winnerPins, ch.wager);
                  const loserMsg = getPayoutAndMsg(loserPins, ch.wager);
                  const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} knocked ${cPins}/6 • ${getUserDisplayFromUserPlain(opponentUser)} knocked ${oPins}/6\n🏆 Winner: ${getUserDisplayFromUserPlain(winnerUser)}\n${winnerMsg.msg}`;
                  await ctx.telegram.sendMessage(groupChatId, summary);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
                  await mp.settlePvpGame(ctx, ch.id, winnerUserId);
                }
              }, 4000);
            } else {
              const winnerUserId = creatorPins > opponentPins ? userAId : userBId;
              const winnerPins = creatorPins > opponentPins ? creatorPins : opponentPins;
              const loserPins = creatorPins > opponentPins ? opponentPins : creatorPins;
              const winnerUser = creatorPins > opponentPins ? creatorUser : opponentUser;
              const loserUser = creatorPins > opponentPins ? opponentUser : creatorUser;
              const winnerMsg = getPayoutAndMsg(winnerPins, ch.wager);
              const loserMsg = getPayoutAndMsg(loserPins, ch.wager);
              const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} knocked ${creatorPins}/6 • ${getUserDisplayFromUserPlain(opponentUser)} knocked ${opponentPins}/6\n🏆 Winner: ${getUserDisplayFromUserPlain(winnerUser)}\n${winnerMsg.msg}`;
              await ctx.telegram.sendMessage(groupChatId, summary);
              if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
              await mp.settlePvpGame(ctx, ch.id, winnerUserId);
            }
          }, 4000);
        } else {
          const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎳' });
          const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎳' });
          const creatorTelegramVal = creatorRollMsg.dice?.value || 1;
          const opponentTelegramVal = opponentRollMsg.dice?.value || 1;

          // Use the same mapping as Bowling.ts (0-6 pins)
          const mapPins = (v: number) => {
            const mapping = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
            return mapping[v as keyof typeof mapping] || 0;
          };
          const creatorPins = mapPins(creatorTelegramVal);
          const opponentPins = mapPins(opponentTelegramVal);

          // Use the same payout logic as Bowling.ts
          function getPayoutAndMsg(pins: number, wager: number) {
            if (pins === 6) {
              const winAmount = wager * 3;
              return { payout: winAmount, msg: `🎳 STRIKE! Win!\nPayout: ${formatUsd(winAmount)}. Pins Down: ${pins}` };
            } else if (pins >= 4 && pins <= 5) {
              const winAmount = wager * 1.5;
              return { payout: winAmount, msg: `🎉 Great Roll! Win!\nPayout: ${formatUsd(winAmount)}. Pins Down: ${pins}` };
            } else {
              return { payout: 0, msg: `😔 Poor Roll - Lose\nPayout: $0.00. Pins Down: ${pins}` };
            }
          }

          setTimeout(async () => {
            if (creatorPins === opponentPins) {
              // Tie -> reroll up to 5 times; if still tied declare draw
              let tries = 0;
              let cPins = creatorPins;
              let oPins = opponentPins;
              while (tries < 5 && cPins === oPins) {
                const tieNote = `🤝 Tie (${cPins} vs ${oPins})! Rerolling...`;
                await ctx.telegram.sendMessage(chatA, tieNote);
                // Mention user before reroll
                await ctx.telegram.sendMessage(chatA, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const cMsg2 = await ctx.telegram.sendDice(chatA, { emoji: '🎳' });
                await ctx.telegram.sendMessage(chatB, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
                const oMsg2 = await ctx.telegram.sendDice(chatB, { emoji: '🎳' });
                cPins = mapPins(cMsg2.dice?.value || 1);
                oPins = mapPins(oMsg2.dice?.value || 1);
                tries++;
              }
              setTimeout(async () => {
                if (cPins === oPins) {
                  const drawMsg = `🤝 Draw after ${tries+1} rolls! No payout. Your wagers are returned.`;
                  await ctx.telegram.sendMessage(chatA, drawMsg);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, drawMsg);
                  await mp.completeDraw(ch.id);
                } else {
                  const winnerUserId = cPins > oPins ? userAId : userBId;
                  const winnerPins = cPins > oPins ? cPins : oPins;
                  const loserPins = cPins > oPins ? oPins : cPins;
                  const winnerUser = cPins > oPins ? creatorUser : opponentUser;
                  const loserUser = cPins > oPins ? opponentUser : creatorUser;
                  const winnerMsg = getPayoutAndMsg(winnerPins, ch.wager);
                  const loserMsg = getPayoutAndMsg(loserPins, ch.wager);
                  const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} knocked ${creatorPins}/6 • ${getUserDisplayFromUserPlain(opponentUser)} knocked ${opponentPins}/6\n🏆 Winner: ${getUserDisplayFromUserPlain(winnerUser)}\n${winnerMsg.msg}`;
                  await ctx.telegram.sendMessage(chatA, summary);
                  if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
                  await mp.settlePvpGame(ctx, ch.id, winnerUserId);
                }
              }, 4000);
            } else {
              const winnerUserId = creatorPins > opponentPins ? userAId : userBId;
              const winnerPins = creatorPins > opponentPins ? creatorPins : opponentPins;
              const loserPins = creatorPins > opponentPins ? opponentPins : creatorPins;
              const winnerUser = creatorPins > opponentPins ? creatorUser : opponentUser;
              const loserUser = creatorPins > opponentPins ? opponentUser : creatorUser;
              const winnerMsg = getPayoutAndMsg(winnerPins, ch.wager);
              const loserMsg = getPayoutAndMsg(loserPins, ch.wager);
              const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} knocked ${creatorPins}/6 • ${getUserDisplayFromUserPlain(opponentUser)} knocked ${opponentPins}/6\n🏆 Winner: ${getUserDisplayFromUserPlain(winnerUser)}\n${winnerMsg.msg}`;
              await ctx.telegram.sendMessage(chatA, summary);
              if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
              await mp.settlePvpGame(ctx, ch.id, winnerUserId);
            }
          }, 4000);
        }
      } else if (ch.game === 'Coinflip') {
        // Single animation for both users in group
        const intro = `🪙 PvP Coinflip! [${creatorUser.username}](tg://user?id=${creatorUser.telegramId}) = HEADS, [${opponentUser.username}](tg://user?id=${opponentUser.telegramId}) = TAILS. Flipping...`;
        if (groupChatId) {
          await ctx.telegram.sendMessage(groupChatId, intro, { parse_mode: 'Markdown' });
          const flipMsg = await ctx.telegram.sendMessage(groupChatId, '🪙');
          const coinStates = ['🪙', '🪙'];
          for (let i = 0; i < coinStates.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            try {
              await ctx.telegram.editMessageText(groupChatId, flipMsg.message_id, undefined, coinStates[i]);
            } catch (e) {}
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // Private chats: show animation to both users separately
          const introA = `🪙 You are HEADS, [${creatorUser.username}](tg://user?id=${creatorUser.telegramId})! Flipping...`;
          const introB = `🪙 You are TAILS, [${opponentUser.username}](tg://user?id=${opponentUser.telegramId})! Flipping...`;
          await ctx.telegram.sendMessage(chatA, introA, { parse_mode: 'Markdown' });
          const flipMsgA = await ctx.telegram.sendMessage(chatA, '🪙');
          const coinStates = ['🪙', '🪙'];
          for (let i = 0; i < coinStates.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            try {
              await ctx.telegram.editMessageText(chatA, flipMsgA.message_id, undefined, coinStates[i]);
            } catch (e) {}
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          await ctx.telegram.sendMessage(chatB, introB, { parse_mode: 'Markdown' });
          const flipMsgB = await ctx.telegram.sendMessage(chatB, '🪙');
          for (let i = 0; i < coinStates.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            try {
              await ctx.telegram.editMessageText(chatB, flipMsgB.message_id, undefined, coinStates[i]);
            } catch (e) {}
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        // Animate simple flip
        const resultIsHeads = Math.random() < 0.5;
        const resultText = resultIsHeads ? 'HEADS' : 'TAILS';
        const winnerUserId = resultIsHeads ? userAId : userBId;
        const payoutUsd = ch.wager * 2;
        const summary = `Result: ${resultText}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
        await ctx.telegram.sendMessage(groupChatId || chatA, summary);
        if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
        await mp.settlePvpGame(ctx, ch.id, winnerUserId);
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

bot.action('deposit_chain_eth_sepolia', async (ctx) => {
  await walletHandler.handleDepositChainEthSepolia(ctx);
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

// Handle coinflip guess (guarded per user)
bot.action(/coinflip_heads_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await gameHandler.handleCoinflipGuess(ctx, 'heads');
});

bot.action(/coinflip_tails_u(\d+)/, async (ctx) => {
  const uid = ctx.match?.[1];
  if (!(await ensureOwner(ctx, uid))) return;
  await gameHandler.handleCoinflipGuess(ctx, 'tails');
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