// src/games/Coinflip.ts
import { BaseGame } from "./BaseGame";
import { User } from "../entities/User";
import { DataSource } from "typeorm";

export class Coinflip extends BaseGame {
  name(): string {
    return "Coinflip";
  }

  async play(
    user: User,
    wager: number,
    db: DataSource,
    guess?: "heads" | "tails"
  ): Promise<{ message: string; winAmount: number }> {
    if (guess !== "heads" && guess !== "tails") {
      return {
        message: "Please pick 'heads' or 'tails'.",
        winAmount: 0,
      };
    }

    const result = Math.random() < 0.5 ? "heads" : "tails";
    if (guess === result) {
      const winAmount = wager * 2;
      return {
        message: `🪙 Coinflip: ${result}! You won ${winAmount.toFixed(4)} ETH!`,
        winAmount,
      };
    } else {
      return {
        message: `🪙 Coinflip: ${result}. You lost your wager.`,
        winAmount: 0,
      };
    }
  }
}