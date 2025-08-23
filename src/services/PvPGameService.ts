// src/services/PvPGameService.ts
import { Context } from "telegraf";
import { AppDataSource } from "../utils/db";
import { Challenge } from "../entities/Challenge";
import { UserService } from "./UserService";
import { MultiplayerService } from "./MultiplayerService";
import { getUserDisplayFromUserPlain } from "../utils/userDisplay";
import { formatUsd } from "../utils/currency";
import WebSocket, { WebSocket as WSWebSocket } from 'ws';

export class PvPGameService {
  private botPlayerSocket: WSWebSocket | null = null;

  constructor(
    private readonly userService: UserService,
    private readonly multiplayerService: MultiplayerService
  ) {
    // Connect to the bot player WebSocket server
    this.connectToBotPlayer();
  }

  private connectToBotPlayer() {
    const BOT_PLAYER_URL = process.env.BOT_PLAYER_URL || 'ws://localhost:8081';
    this.botPlayerSocket = new WebSocket(BOT_PLAYER_URL);
    this.botPlayerSocket.on('open', () => {
      console.log('Connected to Bot Player WebSocket server.');
    });
    this.botPlayerSocket.on('close', () => {
      console.log('Disconnected from Bot Player WebSocket server.');
    });
    this.botPlayerSocket.on('error', (err: Error) => {
      console.error('Bot Player WebSocket error:', err);
    });
    this.botPlayerSocket.on('message', (msg: WebSocket.Data) => {
      console.log('Received message from Bot Player:', msg.toString());
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'move') {
          this.handleBotMove(data);
        }
      } catch (err) {
        console.error('Error parsing bot message:', err);
      }
    });
  }

  private handleBotMove(data: any) {
    const { challengeId, move } = data;
    // Store the bot's move for when the PvP game logic runs
    // The bot's move will be used in the existing PvP settlement logic
    console.log(`Bot move stored for challenge ${challengeId}:`, move);
  }

  // Helper method to check if a user is the bot player
  private isBotPlayer(telegramId: number): boolean {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    return telegramId === BOT_PLAYER_TELEGRAM_ID;
  }

  async handlePvPDice(ctx: Context, challenge: Challenge): Promise<void> {
    const creatorUser = challenge.creator;
    const opponentUser = challenge.opponent!;
    const groupChatId = challenge.isGroup && challenge.chatId ? challenge.chatId : undefined;
    const chatA = groupChatId ?? creatorUser.telegramId;
    const chatB = groupChatId ?? opponentUser.telegramId;
    const userAId = creatorUser.telegramId;
    const userBId = opponentUser.telegramId;

    const intro = `🎲 PvP Dice: ${getUserDisplayFromUserPlain(creatorUser)} vs ${getUserDisplayFromUserPlain(opponentUser)}! Rolling dice for both players...`;
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatA, intro);
    if (userBId !== BOT_PLAYER_TELEGRAM_ID && chatB !== chatA) await ctx.telegram.sendMessage(chatB, intro);

    if (groupChatId) {
      await this.handleGroupPvPDice(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId);
    } else {
      await this.handlePrivatePvPDice(ctx, challenge, chatA, chatB, creatorUser, opponentUser, userAId, userBId);
    }
  }

  private async handleGroupPvPDice(
    ctx: Context,
    challenge: Challenge,
    groupChatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
    const creatorRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
    if (userBId !== BOT_PLAYER_TELEGRAM_ID && groupChatId !== userBId) await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
    const opponentRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
    const creatorRoll = creatorRollMsg.dice?.value || 1;
    const opponentRoll = opponentRollMsg.dice?.value || 1;

    setTimeout(async () => {
      if (creatorRoll === opponentRoll) {
        await this.handleDiceTie(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId, creatorRoll, opponentRoll);
      } else {
        await this.settleDiceGame(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId, creatorRoll, opponentRoll);
      }
    }, 4000);
  }

  private async handlePrivatePvPDice(
    ctx: Context,
    challenge: Challenge,
    chatA: number,
    chatB: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    
    // For bot player, we need to simulate the dice roll since we can't send dice to a bot
    let creatorRoll: number;
    let opponentRoll: number;
    
    if (this.isBotPlayer(userAId)) {
      // Creator is bot, simulate their roll
      creatorRoll = Math.floor(Math.random() * 6) + 1;
      const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎲' });
      opponentRoll = opponentRollMsg.dice?.value || 1;
    } else if (this.isBotPlayer(userBId)) {
      // Opponent is bot, simulate their roll
      const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎲' });
      creatorRoll = creatorRollMsg.dice?.value || 1;
      opponentRoll = Math.floor(Math.random() * 6) + 1;
    } else {
      // Both are human players, normal flow
      const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎲' });
      const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎲' });
      creatorRoll = creatorRollMsg.dice?.value || 1;
      opponentRoll = opponentRollMsg.dice?.value || 1;
    }

    setTimeout(async () => {
      if (creatorRoll === opponentRoll) {
        await this.handleDiceTie(ctx, challenge, chatA, creatorUser, opponentUser, userAId, userBId, creatorRoll, opponentRoll, chatB);
      } else {
        await this.settleDiceGame(ctx, challenge, chatA, creatorUser, opponentUser, userAId, userBId, creatorRoll, opponentRoll, chatB);
      }
    }, 4000);
  }

  private async handleDiceTie(
    ctx: Context,
    challenge: Challenge,
    chatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number,
    creatorRoll: number,
    opponentRoll: number,
    chatB?: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    // New logic: No reroll, just refund 0.9x wager to both users
    const refundMsg = `🤝 Tie (${creatorRoll} vs ${opponentRoll})! Both players get back 0.9x their wager.`;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatId, refundMsg);
    if (chatB && chatB !== chatId && userBId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatB, refundMsg);
    await this.multiplayerService.settlePvpTie(ctx, challenge.id);
  }

  private async settleDiceGame(
    ctx: Context,
    challenge: Challenge,
    chatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number,
    creatorRoll: number,
    opponentRoll: number,
    chatB?: number
  ): Promise<void> {
    const winnerUserId = creatorRoll > opponentRoll ? userAId : userBId;
    const payoutUsd = challenge.wager * 2;
    const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} rolled ${creatorRoll} • ${getUserDisplayFromUserPlain(opponentUser)} rolled ${opponentRoll}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
    
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatId, summary);
    if (chatB && chatB !== chatId && userBId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatB, summary);
    
    await this.multiplayerService.settlePvpGame(ctx, challenge.id, winnerUserId);
  }

  async handlePvPBowling(ctx: Context, challenge: Challenge): Promise<void> {
    const creatorUser = challenge.creator;
    const opponentUser = challenge.opponent!;
    const groupChatId = challenge.isGroup && challenge.chatId ? challenge.chatId : undefined;
    const chatA = groupChatId ?? creatorUser.telegramId;
    const chatB = groupChatId ?? opponentUser.telegramId;
    const userAId = creatorUser.telegramId;
    const userBId = opponentUser.telegramId;

    const intro = `🎳 PvP Bowling: ${getUserDisplayFromUserPlain(creatorUser)} vs ${getUserDisplayFromUserPlain(opponentUser)}! Rolling for both players...`;
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatA, intro);
    if (userBId !== BOT_PLAYER_TELEGRAM_ID && chatB !== chatA) await ctx.telegram.sendMessage(chatB, intro);

    if (groupChatId) {
      await this.handleGroupPvPBowling(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId);
    } else {
      await this.handlePrivatePvPBowling(ctx, challenge, chatA, chatB, creatorUser, opponentUser, userAId, userBId);
    }
  }

  private async handleGroupPvPBowling(
    ctx: Context,
    challenge: Challenge,
    groupChatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
    const creatorRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
    if (userBId !== BOT_PLAYER_TELEGRAM_ID && groupChatId !== userBId) await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
    const opponentRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
    
    const creatorPins = this.mapBowlingPins(creatorRollMsg.dice?.value || 1);
    const opponentPins = this.mapBowlingPins(opponentRollMsg.dice?.value || 1);

    setTimeout(async () => {
      if (creatorPins === opponentPins) {
        await this.handleBowlingTie(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId, creatorPins, opponentPins);
      } else {
        await this.settleBowlingGame(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId, creatorPins, opponentPins);
      }
    }, 4000);
  }

  private async handlePrivatePvPBowling(
    ctx: Context,
    challenge: Challenge,
    chatA: number,
    chatB: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    
    // For bot player, we need to simulate the bowling roll since we can't send dice to a bot
    let creatorPins: number;
    let opponentPins: number;
    
    if (this.isBotPlayer(userAId)) {
      // Creator is bot, simulate their roll
      creatorPins = Math.floor(Math.random() * 6) + 1;
      const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎳' });
      opponentPins = this.mapBowlingPins(opponentRollMsg.dice?.value || 1);
    } else if (this.isBotPlayer(userBId)) {
      // Opponent is bot, simulate their roll
      const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎳' });
      creatorPins = this.mapBowlingPins(creatorRollMsg.dice?.value || 1);
      opponentPins = Math.floor(Math.random() * 6) + 1;
    } else {
      // Both are human players, normal flow
      const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎳' });
      const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎳' });
      creatorPins = this.mapBowlingPins(creatorRollMsg.dice?.value || 1);
      opponentPins = this.mapBowlingPins(opponentRollMsg.dice?.value || 1);
    }

    setTimeout(async () => {
      if (creatorPins === opponentPins) {
        await this.handleBowlingTie(ctx, challenge, chatA, creatorUser, opponentUser, userAId, userBId, creatorPins, opponentPins, chatB);
      } else {
        await this.settleBowlingGame(ctx, challenge, chatA, creatorUser, opponentUser, userAId, userBId, creatorPins, opponentPins, chatB);
      }
    }, 4000);
  }

  private async handleBowlingTie(
    ctx: Context,
    challenge: Challenge,
    chatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number,
    creatorPins: number,
    opponentPins: number,
    chatB?: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    // New logic: No reroll, just refund 0.9x wager to both users
    const refundMsg = `🤝 Tie (${creatorPins} vs ${opponentPins})! Both players get back 0.9x their wager.`;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatId, refundMsg);
    if (chatB && chatB !== chatId && userBId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatB, refundMsg);
    await this.multiplayerService.settlePvpTie(ctx, challenge.id);
  }

  private async settleBowlingGame(
    ctx: Context,
    challenge: Challenge,
    chatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number,
    creatorPins: number,
    opponentPins: number,
    chatB?: number
  ): Promise<void> {
    const winnerUserId = creatorPins > opponentPins ? userAId : userBId;
    const winnerUser = creatorPins > opponentPins ? creatorUser : opponentUser;
    const winnerPins = creatorPins > opponentPins ? creatorPins : opponentPins;
    const loserPins = creatorPins > opponentPins ? opponentPins : creatorPins;
    
    // For PvP: winner gets double the wager amount (not personal bot game rules)
    const payoutUsd = challenge.wager * 2;
    const summary = `Result: ${getUserDisplayFromUserPlain(creatorUser)} knocked ${creatorPins}/6 • ${getUserDisplayFromUserPlain(opponentUser)} knocked ${opponentPins}/6\n🏆 Winner: ${getUserDisplayFromUserPlain(winnerUser)} (${winnerPins} pins)\n💰 Payout: ${formatUsd(payoutUsd)}`;
    
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (userAId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatId, summary);
    if (chatB && chatB !== chatId && userBId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatB, summary);
    
    await this.multiplayerService.settlePvpGame(ctx, challenge.id, winnerUserId);
  }

  async handlePvPCoinflip(ctx: Context, challenge: Challenge): Promise<void> {
    const creatorUser = challenge.creator;
    const opponentUser = challenge.opponent!;
    const groupChatId = challenge.isGroup && challenge.chatId ? challenge.chatId : undefined;
    const chatA = groupChatId ?? creatorUser.telegramId;
    const chatB = groupChatId ?? opponentUser.telegramId;
    const userAId = creatorUser.telegramId;
    const userBId = opponentUser.telegramId;

    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (groupChatId) {
      await this.handleGroupPvPCoinflip(ctx, challenge, groupChatId, creatorUser, opponentUser, userAId, userBId);
    } else {
      await this.handlePrivatePvPCoinflip(ctx, challenge, chatA, chatB, creatorUser, opponentUser, userAId, userBId);
    }

    // Animate simple flip
    const resultIsHeads = Math.random() < 0.5;
    const resultText = resultIsHeads ? 'HEADS' : 'TAILS';
    const winnerUserId = resultIsHeads ? userAId : userBId;
    const payoutUsd = challenge.wager * 2;
    const summary = `Result: ${resultText}\n🏆 Winner: ${winnerUserId === userAId ? getUserDisplayFromUserPlain(creatorUser) : getUserDisplayFromUserPlain(opponentUser)}\n💰 Payout: ${formatUsd(payoutUsd)}`;
    
    if (groupChatId || chatA !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(groupChatId || chatA, summary);
    if (!groupChatId && chatB !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(chatB, summary);
    
    await this.multiplayerService.settlePvpGame(ctx, challenge.id, winnerUserId);
  }

  private async handleGroupPvPCoinflip(
    ctx: Context,
    challenge: Challenge,
    groupChatId: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number
  ): Promise<void> {
    const intro = `🪙 PvP Coinflip! [${creatorUser.username}](tg://user?id=${creatorUser.telegramId}) = HEADS, [${opponentUser.username}](tg://user?id=${opponentUser.telegramId}) = TAILS. Flipping...`;
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    if (groupChatId !== BOT_PLAYER_TELEGRAM_ID) await ctx.telegram.sendMessage(groupChatId, intro, { parse_mode: 'Markdown' });
    
    const flipMsg = await ctx.telegram.sendMessage(groupChatId, '🪙');
    const coinStates = ['🪙', '🪙'];
    
    for (let i = 0; i < coinStates.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        await ctx.telegram.editMessageText(groupChatId, flipMsg.message_id, undefined, coinStates[i]);
      } catch (e) {}
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async handlePrivatePvPCoinflip(
    ctx: Context,
    challenge: Challenge,
    chatA: number,
    chatB: number,
    creatorUser: any,
    opponentUser: any,
    userAId: number,
    userBId: number
  ): Promise<void> {
    const BOT_PLAYER_TELEGRAM_ID = process.env.BOT_PLAYER_TELEGRAM_ID ? parseInt(process.env.BOT_PLAYER_TELEGRAM_ID) : undefined;
    
    // For bot player, we need to simulate the coinflip since we can't send messages to a bot
    if (this.isBotPlayer(userAId)) {
      // Creator is bot, only show opponent's side
      const introB = `🪙 You are TAILS, [${opponentUser.username}](tg://user?id=${opponentUser.telegramId})! Flipping...`;
      await ctx.telegram.sendMessage(chatB, introB, { parse_mode: 'Markdown' });
      const flipMsgB = await ctx.telegram.sendMessage(chatB, '🪙');
      
      const coinStates = ['🪙', '🪙'];
      for (let i = 0; i < coinStates.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        try {
          await ctx.telegram.editMessageText(chatB, flipMsgB.message_id, undefined, coinStates[i]);
        } catch (e) {}
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } else if (this.isBotPlayer(userBId)) {
      // Opponent is bot, only show creator's side
      const introA = `🪙 You are HEADS, [${creatorUser.username}](tg://user?id=${creatorUser.telegramId})! Flipping...`;
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
    } else {
      // Both are human players, normal flow
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
  }

  private mapBowlingPins(value: number): number {
    const mapping = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
    return mapping[value as keyof typeof mapping] || 0;
  }


}
