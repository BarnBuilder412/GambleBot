// src/services/PvPGameService.ts
import { Context } from "telegraf";
import { AppDataSource } from "../utils/db";
import { Challenge } from "../entities/Challenge";
import { UserService } from "./UserService";
import { MultiplayerService } from "./MultiplayerService";
import { getUserDisplayFromUserPlain } from "../utils/userDisplay";
import { formatUsd } from "../utils/currency";

export class PvPGameService {
  constructor(
    private readonly userService: UserService,
    private readonly multiplayerService: MultiplayerService
  ) {}

  async handlePvPDice(ctx: Context, challenge: Challenge): Promise<void> {
    const creatorUser = challenge.creator;
    const opponentUser = challenge.opponent!;
    const groupChatId = challenge.isGroup && challenge.chatId ? challenge.chatId : undefined;
    const chatA = groupChatId ?? creatorUser.telegramId;
    const chatB = groupChatId ?? opponentUser.telegramId;
    const userAId = creatorUser.telegramId;
    const userBId = opponentUser.telegramId;

    const intro = `🎲 PvP Dice: ${getUserDisplayFromUserPlain(creatorUser)} vs ${getUserDisplayFromUserPlain(opponentUser)}! Rolling dice for both players...`;
    await ctx.telegram.sendMessage(chatA, intro);

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
    await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
    const creatorRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎲' });
    await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
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
    const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎲' });
    const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎲' });
    const creatorRoll = creatorRollMsg.dice?.value || 1;
    const opponentRoll = opponentRollMsg.dice?.value || 1;

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
    let tries = 0;
    let cVal = creatorRoll;
    let oVal = opponentRoll;
    
    while (tries < 5 && cVal === oVal) {
      const tieNote = `🤝 Tie (${cVal} vs ${oVal})! Rerolling...`;
      await ctx.telegram.sendMessage(chatId, tieNote);
      
      await ctx.telegram.sendMessage(chatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
      const cMsg = await ctx.telegram.sendDice(chatId, { emoji: '🎲' });
      await ctx.telegram.sendMessage(chatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
      const oMsg = await ctx.telegram.sendDice(chatId, { emoji: '🎲' });
      
      cVal = cMsg.dice?.value || 1;
      oVal = oMsg.dice?.value || 1;
      tries++;
    }

    setTimeout(async () => {
      if (cVal === oVal) {
        const drawMsg = `🤝 Draw after ${tries + 1} rolls! No payout. Your wagers are returned.`;
        await ctx.telegram.sendMessage(chatId, drawMsg);
        if (chatB && chatB !== chatId) await ctx.telegram.sendMessage(chatB, drawMsg);
        await this.multiplayerService.completeDraw(challenge.id);
      } else {
        await this.settleDiceGame(ctx, challenge, chatId, creatorUser, opponentUser, userAId, userBId, cVal, oVal, chatB);
      }
    }, 4000);
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
    
    await ctx.telegram.sendMessage(chatId, summary);
    if (chatB && chatB !== chatId) await ctx.telegram.sendMessage(chatB, summary);
    
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
    await ctx.telegram.sendMessage(chatA, intro);

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
    await ctx.telegram.sendMessage(groupChatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
    const creatorRollMsg = await ctx.telegram.sendDice(groupChatId, { emoji: '🎳' });
    await ctx.telegram.sendMessage(groupChatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
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
    const creatorRollMsg = await ctx.telegram.sendDice(chatA, { emoji: '🎳' });
    const opponentRollMsg = await ctx.telegram.sendDice(chatB, { emoji: '🎳' });
    
    const creatorPins = this.mapBowlingPins(creatorRollMsg.dice?.value || 1);
    const opponentPins = this.mapBowlingPins(opponentRollMsg.dice?.value || 1);

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
    let tries = 0;
    let cPins = creatorPins;
    let oPins = opponentPins;
    
    while (tries < 5 && cPins === oPins) {
      const tieNote = `🤝 Tie (${cPins} vs ${oPins})! Rerolling...`;
      await ctx.telegram.sendMessage(chatId, tieNote);
      
      await ctx.telegram.sendMessage(chatId, `[${creatorUser.username}](tg://user?id=${creatorUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
      const cMsg = await ctx.telegram.sendDice(chatId, { emoji: '🎳' });
      await ctx.telegram.sendMessage(chatId, `[${opponentUser.username}](tg://user?id=${opponentUser.telegramId})'s roll:`, { parse_mode: 'Markdown' });
      const oMsg = await ctx.telegram.sendDice(chatId, { emoji: '🎳' });
      
      cPins = this.mapBowlingPins(cMsg.dice?.value || 1);
      oPins = this.mapBowlingPins(oMsg.dice?.value || 1);
      tries++;
    }

    setTimeout(async () => {
      if (cPins === oPins) {
        const drawMsg = `🤝 Draw after ${tries + 1} rolls! No payout. Your wagers are returned.`;
        await ctx.telegram.sendMessage(chatId, drawMsg);
        if (chatB && chatB !== chatId) await ctx.telegram.sendMessage(chatB, drawMsg);
        await this.multiplayerService.completeDraw(challenge.id);
      } else {
        await this.settleBowlingGame(ctx, challenge, chatId, creatorUser, opponentUser, userAId, userBId, cPins, oPins, chatB);
      }
    }, 4000);
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
    
    await ctx.telegram.sendMessage(chatId, summary);
    if (chatB && chatB !== chatId) await ctx.telegram.sendMessage(chatB, summary);
    
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
    
    await ctx.telegram.sendMessage(groupChatId || chatA, summary);
    if (!groupChatId) await ctx.telegram.sendMessage(chatB, summary);
    
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

  private mapBowlingPins(value: number): number {
    const mapping = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
    return mapping[value as keyof typeof mapping] || 0;
  }


}
