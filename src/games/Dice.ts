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
    guess?: number
  ): Promise<{ message: string; winAmount: number }> {
    const roll = Math.floor(Math.random() * 6) + 1;
    if (!guess || guess < 1 || guess > 6) {
      return { message: "Guess must be 1-6.", winAmount: 0 };
    }
    if (guess === roll) {
      const winAmount = wager * 5;
      return { message: `Dice rolled ${roll}. You won ${winAmount} ETH!`, winAmount };
    }
    return { message: `Dice rolled ${roll}. You lost your wager.`, winAmount: 0 };
  }
}