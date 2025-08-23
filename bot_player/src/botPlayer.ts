// Entry point for the GambleBot Bot Player
// This bot will act as a PvP opponent and communicate with the main game server

import * as dotenv from 'dotenv';
dotenv.config();
import { WebSocketServer, WebSocket } from 'ws';
import { Telegraf } from 'telegraf';

const BOT_PLAYER_TOKEN = process.env.BOT_PLAYER_TOKEN!;
const bot = new Telegraf(BOT_PLAYER_TOKEN);

bot.start((ctx) => ctx.reply('🤖 Bot player is ready to play PvP games!'));

// Store active challenges and chats
const activeChallenges: Record<number, { chatId: number, game: string }> = {};

const PORT = process.env.BOT_PLAYER_PORT ? parseInt(process.env.BOT_PLAYER_PORT) : 8081;
const wss = new WebSocketServer({ port: PORT });

console.log(`Bot Player WebSocket server started on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('Main game server connected.');

  ws.on('message', (message) => {
    console.log('Received message from main server:', message.toString());
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'invite') {
        handleInvite(ws, data);
      }
      // Future: handle other message types (e.g., result)
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Main game server disconnected.');
  });
});

function handleInvite(ws: WebSocket, data: any) {
  const { game, challengeId, opponent } = data;
  // Store the challenge and chat info
  activeChallenges[challengeId] = {
    chatId: opponent.id, // This should be the user's Telegram ID
    game
  };
  // Notify the user that the bot has joined
  bot.telegram.sendMessage(opponent.id, `🤖 Bot has joined your ${game} game!`);

  // Simulate bot move after a short delay
  setTimeout(() => {
    let move: any = {};
    switch (game) {
      case 'Dice':
        move = { value: Math.floor(Math.random() * 6) + 1 };
        break;
      case 'Coinflip':
        move = { side: Math.random() < 0.5 ? 'heads' : 'tails' };
        break;
      case 'Bowling':
        move = { pins: Math.floor(Math.random() * 6) + 1 };
        break;
      default:
        bot.telegram.sendMessage(opponent.id, 'Unknown game type for bot.');
        return;
    }
    // Send move back to the main server
    const response = {
      type: 'move',
      challengeId,
      move
    };
    ws.send(JSON.stringify(response));
    bot.telegram.sendMessage(opponent.id, `🤖 Bot made its move in ${game}!`);
    console.log('Sent move to main server:', response);
  }, 2000); // 2 second delay for realism
}

bot.launch();
console.log('Bot player Telegram bot started.');
