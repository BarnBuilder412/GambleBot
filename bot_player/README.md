# Bot Player

This folder contains the implementation for a bot player that can act as a PvP opponent in the GambleBot game. The bot can be run on a separate server and will communicate with the main game server to participate in games as a player when a human opponent is not available.

## Purpose
- Allow users to play PvP games against a bot when no other user is available.
- The bot listens for game commands and acts as a real player.
- Can be deployed and run independently from the main game server.

## Usage
- Start the bot service on any server with access to the main game server.
- The bot will listen for PvP game invitations and respond as a player.

## Communication
- The bot runs a WebSocket server (default port: 8081).
- The main game server connects as a client and sends PvP invitations and game commands.
- The bot logs all incoming messages and will respond as a player (to be implemented).

## WebSocket Message Protocol (Draft)

### PvP Invitation (from server to bot)
```json
{
  "type": "invite",
  "game": "Dice" | "Coinflip" | "Bowling",
  "challengeId": 123,
  "wager": 10.0,
  "opponent": {
    "id": 456,
    "username": "user1"
  }
}
```

### Bot Move (from bot to server)
```json
{
  "type": "move",
  "challengeId": 123,
  "move": { /* game-specific move data */ }
}
```

### Game Result (from server to bot)
```json
{
  "type": "result",
  "challengeId": 123,
  "result": "win" | "lose" | "tie",
  "details": { /* optional */ }
}
```

## Setup
- Install dependencies: `npm install`
- Run the bot: `npm start`
- You can set the port with the `BOT_PLAYER_PORT` environment variable.

---

Implementation details will be added as the bot is developed.
