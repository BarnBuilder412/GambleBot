// src/games/BaseGame.ts
import { User } from "../entities/User";
import { DataSource } from "typeorm";

export abstract class BaseGame {
  abstract name(): string;

  abstract play(
    user: User,
    wager: number,
    db: DataSource,
    guess?: any
  ): Promise<{ message: string; winAmount: number }>;
}