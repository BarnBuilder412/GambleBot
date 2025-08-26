import * as dotenv from 'dotenv';
dotenv.config();
import { WebSocketServer, WebSocket } from 'ws';
import { Telegraf } from 'telegraf';

const BOT_PLAYER_TOKEN = process.env.BOT_PLAYER_TOKEN!;
const bot = new Telegraf(BOT_PLAYER_TOKEN);

bot.start((ctx) => ctx.reply('🤖 Bot player is ready to play PvP games!'));

const activeChallenges: Record<number, { chatId: number, game: string }> = {};

const PORT = process.env.BOT_PLAYER_PORT ? parseInt(process.env.BOT_PLAYER_PORT) : 9999;
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
  activeChallenges[challengeId] = {
    chatId: opponent.id,
    game
  };
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
    const response = {
      type: 'move',
      challengeId,
      move
    };
    ws.send(JSON.stringify(response));
    console.log('Sent move to main server:', response);
  }, 2000);
}

bot.launch();
console.log('Bot player Telegram bot started.');
