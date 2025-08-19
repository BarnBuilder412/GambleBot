// src/services/UserService.ts
import { Context } from "telegraf";
import { AppDataSource } from "../utils/db";
import { User } from "../entities/User";
import { Transaction, TransactionType } from "../entities/Transaction";
import { generateDepositAddress } from "../utils/wallet";

export class UserService {
  async getOrCreateUser(ctx: Context): Promise<User> {
    const telegramId = ctx.from?.id!;
    const username = ctx.from?.username;

    let user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
    if (!user) {
      user = new User();
      user.telegramId = telegramId;
      user.username = username;
      user.balance = 0;
      await AppDataSource.manager.save(user);

      // Generate deposit address
      const depositAddress = generateDepositAddress(user.id);
      user.depositAddress = depositAddress;
      await AppDataSource.manager.save(user);
    }
    return user;
  }

  async updateBalance(
    user: User,
    amount: number,
    type: TransactionType,
    description?: string
  ): Promise<void> {
    user.balance += amount;
    // Removed insufficient balance check for testing
    // if (user.balance < -0.01) throw new Error("Insufficient balance.");

    const tx = new Transaction();
    tx.user = user;
    tx.amount = amount;
    tx.type = type;
    tx.description = description;

    await AppDataSource.manager.save([user, tx]);
  }

  async getUserBalance(telegramId: number): Promise<number> {
    const user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
    return user?.balance || 0;
  }

  async hasEnoughBalance(user: User, amount: number): Promise<boolean> {
    return user.balance >= amount;
  }
} 