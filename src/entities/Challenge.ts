// src/entities/Challenge.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from "typeorm";
import { User } from "./User";

export type ChallengeStatus = "open" | "accepted" | "cancelled" | "completed";

@Entity()
export class Challenge {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User)
  creator!: User;

  @ManyToOne(() => User, { nullable: true })
  opponent?: User | null;

  @Column({ type: "varchar" })
  game!: string; // Dice | Coinflip | Bowling

  @Column({ type: "float" })
  wager!: number;

  @Column({ type: "varchar", default: "open" })
  status!: ChallengeStatus;

  @CreateDateColumn()
  createdAt!: Date;
}


