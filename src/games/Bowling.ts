// src/games/Bowling.ts
import { BaseGame } from "./BaseGame";
import { User } from "../entities/User";
import { DataSource } from "typeorm";

export class Bowling extends BaseGame {
  name(): string {
    return "Bowling";
  }

  async play(
    user: User,
    wager: number,
    db: DataSource,
    guess?: any
  ): Promise<{ message: string; winAmount: number }> {
    const score = Math.floor(Math.random() * 301); // 0 to 300 inclusive

    if (score > 200) {
      const winAmount = wager * 3;
      return {
        message: `🎳 You scored ${score}! Huge win! You earned ${winAmount.toFixed(
          4
        )} ETH!`,
        winAmount,
      };
    } else if (score > 150) {
      const winAmount = wager * 2;
      return {
        message: `🎳 You scored ${score}! Good job! You earned ${winAmount.toFixed(
          4
        )} ETH!`,
        winAmount,
      };
    } else {
      return {
        message: `🎳 You scored ${score}. Sorry, you lost your wager.`,
        winAmount: 0,
      };
    }
  }
}