'use strict';
/**
 * Direct provider feed check — NO DB, NO frontend, NO round endpoint
 * Provider: https://allpenellexch.com:2053/
 * Socket: wss://allpenellexch.com:2053/socket.io/?EIO=4&transport=websocket
 * Game: Instant Teenpatti 2.0 (live_teen32) — Room event me 'teen32' bhejta hai
 * Provider 'game' event me live packet deta hai:
 *   t1[0].mid = round ID, t1[0].autotime = timer (lt fallback), serverTime = provider timestamp
 * Results 'gameResult' event par aate hain.
 *
 * Usage:
 *   node scripts/socket-diagnostic.js
 *   node scripts/socket-diagnostic.js --game live_teen32 --room teen32
 *
 * Log: logs/socket-diagnostic.log
 */
const fs = require('node:fs');
const path = require('node:path');
const { io } = require('socket.io-client');

const argv = process.argv.slice(2);
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

const PROVIDER_URL = process.env.SPORTS_UPSTREAM_URL || 'https://allpenellexch.com:2053/';
const GAME_SLUG = argVal('--game', process.env.DIAG_GAME_ID || 'live_teen32');
const ROOM = argVal('--room', process.env.DIAG_ROOM || 'teen32');
const RUN_MS = Number(argVal('--duration', process.env.DIAG_MS || 120000));

const logDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'socket-diagnostic.log');
fs.writeFileSync(logFile, '');

function log(line) {
  const ts = new Date().toISOString();
  const text = `[${ts}] ${line}\n`;
  fs.appendFileSync(logFile, text);
  console.log(text.trim());
}

const state = {
  connected: false,
  connectError: '',
  gameEvents: 0,
  gameResultEvents: 0,
  lastRoundId: '',
  lastTimer: '',
  lastServerTime: 0,
};

async function main() {
  log(`START direct provider feed check | provider=${PROVIDER_URL} game=${GAME_SLUG} room=${ROOM} run=${RUN_MS}ms`);

  const upstream = io(PROVIDER_URL, {
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    timeout: 18000,
    reconnectionDelay: 2000,
  });

  upstream.on('connect', () => {
    state.connected = true;
    log(`CONNECTED id=${upstream.id} transport=${upstream.io.engine.transport.name}`);
    upstream.emit('Room', ROOM);
    log(`EMIT Room=${ROOM}`);
  });

  upstream.on('connect_error', (err) => {
    state.connectError = err.message;
    log(`CONNECT_ERROR message=${err.message}`);
  });

  upstream.on('disconnect', (reason) => {
    log(`DISCONNECTED reason=${reason}`);
  });

  upstream.on('game', (data) => {
    state.gameEvents += 1;
    const t1 = data?.t1?.[0] || {};
    const roundId = t1.mid || '';
    const timer = t1.autotime ?? t1.lt ?? '';
    const serverTime = Number(data?.serverTime) || 0;
    state.lastRoundId = roundId;
    state.lastTimer = String(timer);
    state.lastServerTime = serverTime;
    log(`GAME #${state.gameEvents} roundId=${roundId} timer=${timer} serverTime=${serverTime}`);
  });

  upstream.on('gameResult', (data) => {
    state.gameResultEvents += 1;
    log(`GAMERESULT #${state.gameResultEvents} data=${JSON.stringify(data).slice(0, 500)}`);
  });

  upstream.onAny((event, ...args) => {
    if (event === 'game' || event === 'gameResult') return;
    log(`EVENT ${event} args=${JSON.stringify(args).slice(0, 500)}`);
  });

  setTimeout(() => {
    log('--- VERDICT ---');
    log(`CONNECTED: ${state.connected} | connectError=${state.connectError || 'none'}`);
    log(`GAME EVENTS: ${state.gameEvents} | GAMERESULT EVENTS: ${state.gameResultEvents}`);
    log(`LAST roundId=${state.lastRoundId} timer=${state.lastTimer} serverTime=${state.lastServerTime}`);
    if (!state.connected) {
      log('VERDICT: CONNECT NAHI HO RAHA — provider Socket connect nahi hua. Reason: ' + (state.connectError || 'unknown'));
    } else if (state.gameEvents === 0) {
      log('VERDICT: CONNECT HO RAHA HAI, PAR GAME DATA NAHI AA RAHA — Room join hua par 2 min me koi game event nahi aayi. Room galat ho sakta hai ya provider us room me data nahi bhej raha.');
    } else {
      log('VERDICT: CONNECT HO RAHA HAI, GAME DATA AA RAHA HAI — roundId aur timer mil rahe hain. Agar apne game page pe phir bhi blank hai to problem backend ke bridge / frontend me hai, provider me nahi.');
    }
    log('DONE direct provider feed check');
    try { upstream.disconnect(); } catch (e) { log(`DISCONNECT_ERROR ${e.message}`); }
    process.exit(0);
  }, RUN_MS);
}

main().catch((err) => {
  log(`FATAL ${err.message} | ${err.stack}`);
  process.exit(1);
});
