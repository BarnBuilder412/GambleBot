// src/games/Coinflip.ts
import { BaseGame } from "./BaseGame";
import { User } from "../entities/User";
import { DataSource } from "typeorm";
import { formatUsd } from "../utils/currency";

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
    
    let message = "";
    let winAmount = 0;
    
    if (guess === result) {
      winAmount = wager * 2;
      message = `🎉 Win!\nPayout: ${formatUsd(winAmount)}. Result: ${result}`;
    } else {
      message = `😔 Lose\nPayout: $0.00. Result: ${result}`;
    }

    return { message, winAmount };
  }
}