'use strict';
/**
 * Single-game Socket diagnostic — 2 minutes
 * Game: live_teen32 (default, change with --game or DIAG_GAME_ID)
 * Usage:
 *   npm install
 *   node scripts/socket-diagnostic.js
 *   node scripts/socket-diagnostic.js --url https://game-backend-7532.onrender.com --game live_teen32
 *   SOCKET_URL=https://game-backend-7532.onrender.com DIAG_GAME_ID=live_teen32 node scripts/socket-diagnostic.js
 *
 * Log: logs/socket-diagnostic.log (latest) + logs/socket-diagnostic-<timestamp>.log
 * Verdict at end: SOCKET CONNECTED? EVENTS? ROUND/ODDS? HTTP ROUND API? + WHY error
 */
const fs = require('node:fs');
const path = require('node:path');
const { io } = require('socket.io-client');

// ---- args ----
const argv = process.argv.slice(2);
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const SOCKET_URL = argVal('--url', process.env.SOCKET_URL || process.env.BACKEND_URL || 'http://localhost:3203');
const GAME_ID = argVal('--game', process.env.DIAG_GAME_ID || 'live_teen32');
const RUN_MS = Number(argVal('--duration', process.env.DIAG_MS || 120000));

// ---- log file ----
const logDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `socket-diagnostic-${stamp}.log`);
const latestFile = path.join(logDir, 'socket-diagnostic.log');

function log(line) {
  const ts = new Date().toISOString();
  const text = `[${ts}] ${line}\n`;
  fs.appendFileSync(logFile, text);
  fs.appendFileSync(latestFile, text);
  console.log(text.trim());
}

// ---- state ----
const state = {
  httpRound: { tried: false, status: null, ok: false, body: '', error: '' },
  connected: false,
  connectError: '',
  disconnectReason: '',
  eventsTotal: 0,
  roundOddsEvents: 0,
  lastEventAt: null,
  lastEventName: '',
  transportsTried: [],
};

function isRoundOddsEvent(name, argsText) {
  const hay = `${name} ${argsText}`.toLowerCase();
  return (
    hay.includes('round') || hay.includes('odds') || hay.includes('timer') ||
    hay.includes('feed') || hay.includes(GAME_ID.toLowerCase())
  );
}

async function checkHttpRound() {
  const url = `${SOCKET_URL.replace(/\/$/, '')}/api/customer/games/${GAME_ID}/round`;
  state.httpRound.tried = true;
  log(`HTTP CHECK GET ${url}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    const body = (await res.text()).slice(0, 1000);
    state.httpRound.status = res.status;
    state.httpRound.ok = res.ok;
    state.httpRound.body = body;
    log(`HTTP ROUND status=${res.status} ok=${res.ok} body=${body}`);
  } catch (e) {
    clearTimeout(t);
    state.httpRound.error = e.name === 'AbortError' ? 'TIMEOUT 20s — backend ne 20s me jawab nahi diya' : e.message;
    log(`HTTP ROUND ERROR ${state.httpRound.error}`);
  }
}

async function main() {
  fs.writeFileSync(latestFile, '');
  log(`START single-game diagnostic | game=${GAME_ID} url=${SOCKET_URL} run=${RUN_MS}ms`);
  log(`log file: ${logFile}`);

  await checkHttpRound();

  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    state.connected = true;
    const transport = socket.io.engine.transport.name;
    state.transportsTried.push(transport);
    log(`CONNECTED id=${socket.id} transport=${transport}`);
    socket.emit('join', { gameId: GAME_ID });
    socket.emit('joinGame', { gameId: GAME_ID });
    socket.emit('subscribe', { gameId: GAME_ID });
    socket.emit('joinRoom', GAME_ID);
    log(`EMIT join/joinGame/subscribe/joinRoom gameId=${GAME_ID}`);
  });

  socket.on('connect_error', (err) => {
    state.connectError = err.message;
    log(`CONNECT_ERROR message=${err.message}`);
    if (err.message.includes('xhr poll error')) {
      log('REASON HINT: xhr poll error = backend tak HTTP request nahi pahunch rahi / backend down / CORS / Render sleep');
    }
    if (err.message.includes('timeout')) {
      log('REASON HINT: timeout = backend cold start (Render 50s) ya DB lock — pehle backend warm karo');
    }
  });

  socket.on('disconnect', (reason) => {
    state.disconnectReason = reason;
    log(`DISCONNECTED reason=${reason}`);
  });

  socket.on('error', (err) => {
    log(`SOCKET_ERROR ${JSON.stringify(err)}`);
  });

  socket.onAny((event, ...args) => {
    state.eventsTotal += 1;
    state.lastEventAt = new Date().toISOString();
    state.lastEventName = event;
    const text = JSON.stringify(args).slice(0, 1000);
    const isRelevant = isRoundOddsEvent(event, text);
    if (isRelevant) state.roundOddsEvents += 1;
    log(`EVENT ${event} relevant=${isRelevant} args=${text}`);
  });

  setTimeout(() => {
    log('--- VERDICT (2 min khatam) ---');
    log(`1. HTTP ROUND API: tried=${state.httpRound.tried} status=${state.httpRound.status} ok=${state.httpRound.ok} error=${state.httpRound.error || 'none'}`);
    log(`2. SOCKET CONNECTED: ${state.connected} | connectError=${state.connectError || 'none'} | disconnect=${state.disconnectReason || 'none'}`);
    log(`3. TOTAL EVENTS: ${state.eventsTotal} | ROUND/ODDS/TIMER EVENTS: ${state.roundOddsEvents} | last event: ${state.lastEventName} at ${state.lastEventAt}`);
    log(`4. TRANSPORTS: ${state.transportsTried.join(', ') || 'none'}`);

    let verdict = '';
    if (!state.connected) {
      verdict = 'RESPONSE NAHI AAYEGA — Socket hi connect nahi hua. Reason: ' + (state.connectError || 'unknown') + '. Pehle backend warm karo, phir CORS / Socket.IO server check karo.';
    } else if (state.eventsTotal === 0) {
      verdict = 'RESPONSE NAHI AAYEGA — Socket connect hua par 2 min me koi event nahi aayi. Reason: backend feed emit nahi kar raha (feed service / live_feeds / DB lock).';
    } else if (state.roundOddsEvents === 0) {
      verdict = 'PARTIAL — Socket connect hua aur events aayi, par round/odds/timer wali event nahi aayi. Reason: feed data aa raha hai par game-specific round emit nahi ho raha.';
    } else {
      verdict = 'RESPONSE AAYEGA — Socket connect hua aur round/odds events aa rahi hain. Agar frontend pe phir bhi blank hai to problem frontend (NEXT_PUBLIC_SOCKET_URL / game page) me hai, backend me nahi.';
    }
    if (!state.httpRound.ok) {
      verdict += ` | HTTP ROUND API bhi fail hai (status=${state.httpRound.status} error=${state.httpRound.error}).`;
    }
    log(`VERDICT: ${verdict}`);
    log('DONE socket diagnostic');
    try { socket.disconnect(); } catch (e) { log(`DISCONNECT_ERROR ${e.message}`); }
    process.exit(0);
  }, RUN_MS);
}

main().catch((err) => {
  log(`FATAL ${err.message} | ${err.stack}`);
  process.exit(1);
});
