# 🤖 BotFather Complete Setup Guide

This guide shows you exactly what to configure in BotFather to support all features of your Bot.

## 📋 Step-by-Step BotFather Configuration

### 1. Create Your Bot

1. **Start BotFather**: Go to [@BotFather](https://t.me/botfather)
2. **Send**: `/newbot`
3. **Bot Name**: `BlockRally` (or your preferred name)
4. **Bot Username**: `@Block_Rally_Bot` (must end in 'bot' and be unique)
5. **Save the Token**: Copy the token BotFather gives you and add it to your `.env` file

### 2. Set Bot Description

```
/setdescription
```
Then send this description:
```
🎮 Welcome to BlockRally – The Ultimate Crypto Game Hub!

Play exciting mini-games with your friends and the community while keeping it fun and fair:

🎮 Available Games: Dice, Bowling, Coinflip
👥 PvP Challenges  or Instant Match with Bot
💰 Smooth deposits & withdrawals on ETH Sepolia

✨ Designed for entertainment, fairness, and community fun.
Join now and enjoy the thrill of friendly crypto-powered games! 🚀
```

### 3. Set About Text

```
/setabouttext
```
Then send:
```
The most popular bot for live games with other people!

Bot: @Block_Rally_Bot

Community: @BlockRally
```

### 4. Set Bot Commands

```
/setcommands
```
Then send this list:
```
play - 🎲 Quick access to all games (Dice, Bowling, Coinflip)
```

### 5. Set Bot Picture (Profile Photo)

```
/setuserpic
```
Upload a image

**Recommended image specs:**
- Size: 512x512 pixels
- Format: PNG or JPG

### 6. Enable Inline Mode (Optional)

```
/setinline
```
Then send:
```
🌐 Share BlockRally with your friends!
```

This allows users to share your bot in other chats by typing `@yourbotusername`

### 7. Set Inline Keyboard

```
/setinlinefeedback
```
Send: `Enabled`

This enables inline keyboard functionality (required for your game buttons).

### 8. Configure Bot Settings

#### Enable Groups
```
/setjoingroups
```
Choose: `Enable` (your bot supports group gameplay and PvP challenges)

#### Set Group Privacy
```
/setprivacy
```
Choose: `Disable` (so bot can read messages for game commands in groups)

#### Set Bot Domain (Recommanded for Production)
```
/setdomain
```
If you have a website, add it here: `https://yourdomain.com`