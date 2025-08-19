// src/services/GameManager.ts
import { Context } from "telegraf";
import { User } from "../entities/User";
import { TransactionType } from "../entities/Transaction";
import { UserService } from "./UserService";
import { Dice } from "../games/Dice";
import { Coinflip } from "../games/Coinflip";
import { Bowling } from "../games/Bowling";
import { AppDataSource } from "../utils/db";

export interface GameSession {
  game?: string;
  wager?: number;
  awaitingGuess?: boolean;
}

export class GameManager {
  private games = {
    Dice: new Dice(),
    Coinflip: new Coinflip(),
    Bowling: new Bowling(),
  };

  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  getAvailableGames(): string[] {
    return Object.keys(this.games);
  }

  isValidGame(gameName: string): boolean {
    return gameName in this.games;
  }

  async processWager(ctx: Context, gameName: string, wagerText: string): Promise<{ success: boolean; message?: string }> {
    const wager = parseFloat(wagerText);
    if (isNaN(wager) || wager <= 0) {
      return { success: false, message: 'Please enter a valid wager amount (ETH).' };
    }

    const user = await this.userService.getOrCreateUser(ctx);
    // Removed balance check for testing
    // if (!await this.userService.hasEnoughBalance(user, wager)) {
    //   return { success: false, message: 'Insufficient balance for this wager.' };
    // }

    // Store wager in session
    ctx.session.wager = wager;
    ctx.session.game = gameName;

    return { success: true };
  }

  async playDice(ctx: Context, diceValue: number): Promise<{ success: boolean; message: string; winAmount?: number }> {
    if (ctx.session.game !== 'Dice' || !ctx.session.wager) {
      return { success: false, message: 'Please start a Dice game first.' };
    }

    const user = await this.userService.getOrCreateUser(ctx);
    
    // Removed balance check for testing
    // if (!await this.userService.hasEnoughBalance(user, ctx.session.wager)) {
    //   return { success: false, message: 'Insufficient balance for this wager.' };
    // }

    // Deduct wager
    await this.userService.updateBalance(user, -ctx.session.wager, TransactionType.BET, 'Dice wager');

    // Use the existing Dice game class
    const diceGame = this.games.Dice;
    const result = await diceGame.play(user, ctx.session.wager, AppDataSource, diceValue);

    // Add winnings if any
    if (result.winAmount > 0) {
      await this.userService.updateBalance(user, result.winAmount, TransactionType.WIN, 'Dice win');
    }

    return { success: true, message: result.message, winAmount: result.winAmount };
  }

  async playCoinflip(ctx: Context, guess: "heads" | "tails"): Promise<{ success: boolean; message: string; winAmount?: number }> {
    if (ctx.session.game !== 'Coinflip' || !ctx.session.wager) {
      return { success: false, message: 'Please start a Coinflip game first.' };
    }

    const user = await this.userService.getOrCreateUser(ctx);
    
    // Removed balance check for testing
    // if (!await this.userService.hasEnoughBalance(user, ctx.session.wager)) {
    //   return { success: false, message: 'Insufficient balance for this wager.' };
    // }

    // Deduct wager
    await this.userService.updateBalance(user, -ctx.session.wager, TransactionType.BET, 'Coinflip wager');

    // Use the existing Coinflip game class
    const coinflipGame = this.games.Coinflip;
    const result = await coinflipGame.play(user, ctx.session.wager, AppDataSource, guess);

    // Add winnings if any
    if (result.winAmount > 0) {
      await this.userService.updateBalance(user, result.winAmount, TransactionType.WIN, 'Coinflip win');
    }

    return { success: true, message: result.message, winAmount: result.winAmount };
  }

  async playBowling(ctx: Context, bowlingValue?: number): Promise<{ success: boolean; message: string; winAmount?: number }> {
    if (ctx.session.game !== 'Bowling' || !ctx.session.wager) {
      return { success: false, message: 'Please start a Bowling game first.' };
    }

    const user = await this.userService.getOrCreateUser(ctx);
    
    // Removed balance check for testing
    // if (!await this.userService.hasEnoughBalance(user, ctx.session.wager)) {
    //   return { success: false, message: 'Insufficient balance for this wager.' };
    // }

    // Deduct wager
    await this.userService.updateBalance(user, -ctx.session.wager, TransactionType.BET, 'Bowling wager');

    // Use the existing Bowling game class with bowling value from animation
    const bowlingGame = this.games.Bowling;
    const result = await bowlingGame.play(user, ctx.session.wager, AppDataSource, bowlingValue);

    // Add winnings if any
    if (result.winAmount > 0) {
      await this.userService.updateBalance(user, result.winAmount, TransactionType.WIN, 'Bowling win');
    }

    return { success: true, message: result.message, winAmount: result.winAmount };
  }

  clearSession(ctx: Context): void {
    ctx.session = {};
  }
} 