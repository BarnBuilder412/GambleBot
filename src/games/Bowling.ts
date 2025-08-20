// src/games/Bowling.ts
import { BaseGame } from "./BaseGame";
import { User } from "../entities/User";
import { DataSource } from "typeorm";

export class Bowling extends BaseGame {
  name(): string {
    return "Bowling";
  }

  async play(
    user: User,
    wager: number,
    db: DataSource,
    bowlingValue?: number
  ): Promise<{ message: string; winAmount: number }> {
    // Use provided bowling value (from Telegram animation) or generate random for testing
    const telegramDiceValue = bowlingValue || Math.floor(Math.random() * 6) + 1; // 1-6 from Telegram
    
    // Map Telegram bowling dice (1-6) to actual bowling pins (0-10)
    const actualPins = this.mapTelegramToActualPins(telegramDiceValue);
    
    // Debug logging
    console.log(`Bowling: Telegram dice=${telegramDiceValue}, Mapped pins=${actualPins}`);
    
    let winAmount = 0;
    let message = "";

    // Apply new betting rules
    if (actualPins === 10) {
      // Strike (10 pins) → payout x3
      winAmount = wager * 3;
      message = `Win\nPayout: $${winAmount.toFixed(2)}. Down Pins: ${this.getBowlingVisual(actualPins)}`;
    } else if (actualPins >= 7 && actualPins <= 9) {
      // 7-9 pins → payout x1.5
      winAmount = wager * 1.5;
      message = `Win\nPayout: $${winAmount.toFixed(2)}. Down Pins: ${this.getBowlingVisual(actualPins)}`;
    } else {
      // 0-6 pins → loss
      message = `Lose\nPayout: $0. Down Pins: ${this.getBowlingVisual(actualPins)}`;
    }

    return { message, winAmount };
  }

  private mapTelegramToActualPins(telegramValue: number): number {
    // Direct mapping from Telegram bowling dice (1-6) to bowling pins (0-10)
    // This ensures consistency between animation and result
    const mapping = {
      1: 0,  // Gutter ball - no pins
      2: 3,  // Poor roll - 3 pins
      3: 5,  // Average roll - 5 pins  
      4: 7,  // Good roll - 7 pins (wins 1.5x)
      5: 9,  // Great roll - 9 pins (wins 1.5x)
      6: 10  // Strike! - all pins (wins 3x)
    };
    
    return mapping[telegramValue as keyof typeof mapping] || 0;
  }

  private getBowlingVisual(pins: number): string {
    const visuals = {
      0: '🎳 ⚪⚪⚪⚪⚪⚪⚪⚪⚪⚪ (Gutter ball!)',
      1: '🎳 💥⚪⚪⚪⚪⚪⚪⚪⚪⚪ (1 pin)',
      2: '🎳 💥💥⚪⚪⚪⚪⚪⚪⚪⚪ (2 pins)',
      3: '🎳 💥💥💥⚪⚪⚪⚪⚪⚪⚪ (3 pins)',
      4: '🎳 💥💥💥💥⚪⚪⚪⚪⚪⚪ (4 pins)',
      5: '🎳 💥💥💥💥💥⚪⚪⚪⚪⚪ (5 pins)',
      6: '🎳 💥💥💥💥💥💥⚪⚪⚪⚪ (6 pins)',
      7: '🎳 💥💥💥💥💥💥💥⚪⚪⚪ (7 pins)',
      8: '🎳 💥💥💥💥💥💥💥💥⚪⚪ (8 pins)',
      9: '🎳 💥💥💥💥💥💥💥💥💥⚪ (9 pins)',
      10: '🎳 💥💥💥💥💥💥💥💥💥💥 (STRIKE!)'
    };
    
    return visuals[pins as keyof typeof visuals] || visuals[0];
  }
}