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
    
    let message = `🪙 **COINFLIP RESULT** 🪙\n\n`;
    message += `${result === "heads" ? "👑" : "⚡"} The coin landed on: **${result.toUpperCase()}**\n`;
    message += `🎯 Your guess: **${guess.toUpperCase()}**\n\n`;
    
    if (guess === result) {
      const winAmount = wager * 2;
      message += `🎉 **CORRECT!** You guessed right!\n💰 You win ${winAmount.toFixed(4)} ETH! (2x payout)`;
      return { message, winAmount };
    } else {
      message += `😢 **WRONG!** Better luck next time!\n💸 You lost your wager.`;
      return { message, winAmount: 0 };
    }
  }
}