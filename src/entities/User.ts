// src/entities/User.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    Index,
  } from "typeorm";
  import { Transaction } from "./Transaction";
  
  @Entity()
  export class User {
    @PrimaryGeneratedColumn()
    id!: number;
  
    @Index({ unique: true })
    @Column()
    telegramId!: number;
  
    @Column({ nullable: true })
    username?: string;
  
    @Column({ type: "float", default: 0 })
    balance!: number;
  
    @Column({ nullable: true, unique: true })
    depositAddress?: string; // Ethereum address
  
    @OneToMany(() => Transaction, (transaction) => transaction.user)
    transactions!: Transaction[];
  }