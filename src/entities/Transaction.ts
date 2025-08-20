// src/entities/Transaction.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
  } from "typeorm";
  import { User } from "./User";
  
  export enum TransactionType {
    DEPOSIT = "deposit",
    WITHDRAW = "withdraw",
    WAGER = "wager",
    WIN = "win",
    BET = "bet",
    REFUND = "refund",
  }
  
  @Entity()
  export class Transaction {
    @PrimaryGeneratedColumn()
    id!: number;
  
    @ManyToOne(() => User, (user) => user.transactions)
    user!: User;
  
    @Column({ type: "float" })
    amount!: number;
  
    @Column({ type: "enum", enum: TransactionType })
    type!: TransactionType;
  
    @CreateDateColumn()
    createdAt!: Date;
  
    @Column({ nullable: true })
    description?: string;
  }