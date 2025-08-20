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
    const roll = diceValue;

    let winAmount = 0;
    let message = "";

    if (roll! >= 4) {
      winAmount = wager * 2;
      message = `Win\nPayout: $${winAmount.toFixed(2)}. Roll: ${roll}`;
    } else {
      message = `Lose\nPayout: $0. Roll: ${roll}`;
    }

    return { message, winAmount };
  }
}