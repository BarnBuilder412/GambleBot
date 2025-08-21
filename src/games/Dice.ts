import { BaseGame } from "./BaseGame";
import { User } from "../entities/User";
import { DataSource } from "typeorm";
import { formatUsd } from "../utils/currency";

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
      message = `🎉 Win!\nPayout: ${formatUsd(winAmount)}. Roll: ${roll}`;
    } else {
      message = `😔 Lose\nPayout: $0.00. Roll: ${roll}`;
    }

    return { message, winAmount };
  }
}