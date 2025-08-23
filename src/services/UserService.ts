// src/services/UserService.ts
import { Context } from "telegraf";
import { AppDataSource } from "../utils/db";
import { User } from "../entities/User";
import { Transaction, TransactionType } from "../entities/Transaction";
import { generateDepositAddress } from "../utils/wallet";
import { formatUsd } from "../utils/currency";

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
    // CRITICAL: Prevent negative balance
    const newBalance = user.balance + amount;
    if (newBalance < 0) {
      const currentUsd = user.balance;
      const requiredUsd = Math.abs(amount);
      throw new Error(`Insufficient balance. Current: ${formatUsd(currentUsd)}, Required: ${formatUsd(requiredUsd)}`);
    }

    user.balance = newBalance;

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
    // Refresh user balance from database to ensure accuracy
    const freshUser = await this.refreshUserBalance(user.id);
    if (!freshUser) return false;
    
    // Update the user object with fresh balance
    user.balance = freshUser.balance;
    
    return user.balance >= amount && amount > 0;
  }

  /**
   * Safely deduct balance with comprehensive checks
   */
  async deductBalance(
    user: User,
    amount: number,
    type: TransactionType,
    description?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Double-check balance before deduction
      if (!await this.hasEnoughBalance(user, amount)) {
        const currentUsd = user.balance;
        const requiredUsd = amount;
        return {
          success: false,
          error: `Insufficient balance. Current: ${formatUsd(currentUsd)}, Required: ${formatUsd(requiredUsd)}`
        };
      }

      await this.updateBalance(user, -amount, type, description);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Balance deduction failed'
      };
    }
  }

  async refreshUserBalance(userId: number): Promise<User | null> {
    // Refresh user from database to get latest balance
    const repo = AppDataSource.getRepository(User);
    return await repo.findOneBy({ id: userId });
  }

  async getUserTransactionHistory(telegramId: number, limit: number = 10): Promise<Transaction[]> {
    const user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
    if (!user) return [];

    return await AppDataSource.getRepository(Transaction)
      .find({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
        take: limit
      });
  }

  async getUserGameTransactionHistory(telegramId: number, limit: number = 10, offset: number = 0, transactionTypes: TransactionType[]): Promise<Transaction[]> {
    const user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
    if (!user) return [];

    return await AppDataSource.getRepository(Transaction)
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: user.id })
      .andWhere('transaction.type IN (:...types)', { types: transactionTypes })
      .orderBy('transaction.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  async getUserGameTransactionCount(telegramId: number, transactionTypes: TransactionType[]): Promise<number> {
    const user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
    if (!user) return 0;

    return await AppDataSource.getRepository(Transaction)
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: user.id })
      .andWhere('transaction.type IN (:...types)', { types: transactionTypes })
      .getCount();
  }

  async getOrCreateBotUser(): Promise<User> {
    const telegramId = 999999999; // Reserved ID for bot player
    let user = await AppDataSource.getRepository(User).findOneBy({ telegramId });
    if (!user) {
      user = new User();
      user.telegramId = telegramId;
      user.username = 'BotPlayer';
      user.balance = 0;
      await AppDataSource.manager.save(user);
      user.depositAddress = 'bot';
      await AppDataSource.manager.save(user);
    }
    return user;
  }
} 