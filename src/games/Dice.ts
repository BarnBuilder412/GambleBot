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
    let message = "";

    // New rule: Win if dice shows 4, 5, or 6
    if (roll >= 4) {
      winAmount = wager * 2; // 2x payout (50% chance)
      message = `Win\nPayout: $${winAmount.toFixed(2)}`;
    } else {
      message = `Lose\nPayout: $0`;
    }

    return { message, winAmount };
  }
}