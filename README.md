# Socket Diagnostic — Single Game (live_teen32)

2 minute tak ek hi game ka Socket.IO + Round API check karta hai, aur log file me clear verdict deta hai: **response aayega ya nahi, aur error kyon aa rahi hai.**

## Run karo

```bash
npm install
node scripts/socket-diagnostic.js
```

Live backend ke liye:

```bash
node scripts/socket-diagnostic.js --url https://game-backend-7532.onrender.com --game live_teen32
```

Ya env se:

```bash
SOCKET_URL=https://game-backend-7532.onrender.com DIAG_GAME_ID=live_teen32 node scripts/socket-diagnostic.js
```

## Log kahan milega

- `logs/socket-diagnostic.log` — latest run
- `logs/socket-diagnostic-<timestamp>.log` — har run ki alag file

## Verdict kya batayega

Log ke end me ye milega:

1. **HTTP ROUND API** — `/api/customer/games/<game>/round` ka status, ok ya error
2. **SOCKET CONNECTED** — connect hua ya `CONNECT_ERROR` kyon aaya
3. **TOTAL EVENTS / ROUND-ODDS EVENTS** — 2 min me kitni events aayi, round/odds/timer wali kitni
4. **VERDICT** — 4 me se ek:
   - `RESPONSE NAHI AAYEGA — Socket hi connect nahi hua`
   - `RESPONSE NAHI AAYEGA — Socket connect hua par koi event nahi aayi (feed emit nahi ho raha)`
   - `PARTIAL — events aayi par round/odds wali nahi`
   - `RESPONSE AAYEGA — round/odds events aa rahi hain, problem frontend me hai`

## GitHub pe repo banao

```bash
git init
git add .
git commit -m "socket diagnostic single game live_teen32"
gh repo create socket-diagnostic-single-game --public --source=. --push
# ya GitHub website pe repo banao, phir:
git remote add origin https://github.com/codemystiqpro/socket-diagnostic-single-game.git
git branch -M main
git push -u origin main
```

> Is repo me koi password / secret / `.env` mat daalna. Sirf diagnostic code hai.
