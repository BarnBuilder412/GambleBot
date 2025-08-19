// src/services/MultiplayerService.ts
import { Context, Markup } from "telegraf";
import { AppDataSource } from "../utils/db";
import { Challenge } from "../entities/Challenge";
import { UserService } from "./UserService";
import { TransactionType } from "../entities/Transaction";

export class MultiplayerService {
  constructor(private readonly userService: UserService) {}

  async createChallenge(ctx: Context, game: string, wager: number): Promise<Challenge> {
    const user = await this.userService.getOrCreateUser(ctx);

    const repo = AppDataSource.getRepository(Challenge);
    const challenge = new Challenge();
    challenge.creator = user;
    challenge.game = game;
    challenge.wager = wager;
    challenge.status = "open";
    challenge.chatId = ctx.chat?.id ?? null;
    challenge.isGroup = (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup');
    await repo.save(challenge);

    return challenge;
  }

  async listOpenChallenges(game?: string): Promise<Challenge[]> {
    const repo = AppDataSource.getRepository(Challenge);
    const where = game ? { status: "open" as const, game } : { status: "open" as const };
    return repo.find({ where, relations: ["creator"] });
  }

  async acceptChallenge(ctx: Context, challengeId: number): Promise<{ ok: boolean; message: string }> {
    const user = await this.userService.getOrCreateUser(ctx);
    const repo = AppDataSource.getRepository(Challenge);
    const challenge = await repo.findOne({ where: { id: challengeId }, relations: ["creator", "opponent"] });
    if (!challenge || challenge.status !== "open") {
      return { ok: false, message: "Challenge is no longer available." };
    }
    if (challenge.creator.telegramId === user.telegramId) {
      return { ok: false, message: "You cannot accept your own challenge." };
    }

    challenge.opponent = user;
    challenge.status = "accepted";
    await repo.save(challenge);

    return { ok: true, message: `Challenge #${challenge.id} accepted!` };
  }

  async settlePvpGame(
    ctx: Context,
    challengeId: number,
    winnerTelegramId: number
  ): Promise<void> {
    const repo = AppDataSource.getRepository(Challenge);
    const challenge = await repo.findOne({ where: { id: challengeId }, relations: ["creator", "opponent"] });
    if (!challenge || challenge.status !== "accepted" || !challenge.opponent) return;

    const totalPot = challenge.wager * 2;

    const creator = challenge.creator;
    const opponent = challenge.opponent;

    // Deduct wagers from both at acceptance time? For now, deduct here to keep it simple.
    await this.userService.updateBalance(creator, -challenge.wager, TransactionType.BET, `${challenge.game} PvP wager`);
    await this.userService.updateBalance(opponent, -challenge.wager, TransactionType.BET, `${challenge.game} PvP wager`);

    const winner = creator.telegramId === winnerTelegramId ? creator : opponent;
    await this.userService.updateBalance(winner, totalPot, TransactionType.WIN, `${challenge.game} PvP win`);

    challenge.status = "completed";
    await repo.save(challenge);
  }

  async completeDraw(challengeId: number): Promise<void> {
    const repo = AppDataSource.getRepository(Challenge);
    const challenge = await repo.findOne({ where: { id: challengeId } });
    if (!challenge) return;
    challenge.status = "completed";
    await repo.save(challenge);
  }
}


