// src/games/Dice.ts
import { BaseGame } from "./BaseGame";
import { User } from "../entities/User";
import { DataSource } from "typeorm";

export class Dice extends BaseGame {
  name(): string {
    return "Dice";
  }

  async play(
    user: User,
    wager: number,
    db: DataSource,
    diceValue?: number
  ): Promise<{ message: string; winAmount: number }> {
    // Use provided dice value (from Telegram animation) or generate random for testing
    const roll = diceValue || Math.floor(Math.random() * 6) + 1;
    
    let winAmount = 0;
    let message = `🎲 The dice rolled: ${roll}\n`;

    // New rule: Win if dice shows 4, 5, or 6
    if (roll >= 4) {
      winAmount = wager * 2; // 2x payout (50% chance)
      message += `🎉 You won! Dice shows ${roll} (4-6 wins). You earn ${winAmount.toFixed(4)} ETH!`;
    } else {
      message += `😢 You lost! Dice shows ${roll} (1-3 loses). Better luck next time!`;
    }

    return { message, winAmount };
  }
}