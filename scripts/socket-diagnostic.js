'use strict';
/**
 * Simple connect check — NO DB, NO Socket, NO frontend, NO round endpoint
 * Direct upstream URLs se fetch karta hai, 4 baar, log me response likhta hai.
 *
 * Direct values (env se override kar sakte ho):
 *   SPORTS_UPSTREAM_URL=https://allpenellexch.com:8443/
 *   SPORTS_SCOREBOARD_ORIGIN=https://api.trubets365.com
 *   SPORTS_STALE_MS=60000
 *   SPORTS_REFRESH_MS=20000
 *
 * Usage:
 *   node scripts/socket-diagnostic.js
 *
 * Log: logs/socket-diagnostic.log
 */
const fs = require('node:fs');
const path = require('node:path');

const SPORTS_UPSTREAM_URL = process.env.SPORTS_UPSTREAM_URL || 'https://allpenellexch.com:8443/';
const SPORTS_SCOREBOARD_ORIGIN = process.env.SPORTS_SCOREBOARD_ORIGIN || 'https://api.trubets365.com';
const SPORTS_STALE_MS = Number(process.env.SPORTS_STALE_MS || 60000);
const SPORTS_REFRESH_MS = Number(process.env.SPORTS_REFRESH_MS || 20000);

const TIMES = 4;
const GAP_MS = SPORTS_REFRESH_MS; // 20 second gap

const ENDPOINTS = [
  SPORTS_UPSTREAM_URL,
  SPORTS_SCOREBOARD_ORIGIN,
];

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

async function fetchOnce(n, url) {
  log(`TRY ${n}/${TIMES} GET ${url}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json, text/html, */*' } });
    clearTimeout(t);
    const body = (await res.text()).slice(0, 500);
    const ms = Date.now() - start;
    log(`TRY ${n} RESPONSE status=${res.status} ok=${res.ok} time=${ms}ms body=${body}`);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    clearTimeout(t);
    const reason = e.name === 'AbortError' ? 'TIMEOUT 20s — upstream ne jawab nahi diya' : e.message;
    log(`TRY ${n} ERROR ${reason}`);
    return { ok: false, status: null, error: reason };
  }
}

async function main() {
  log(`START direct upstream check | times=${TIMES} gap=${GAP_MS}ms stale=${SPORTS_STALE_MS}ms`);
  log(`UPSTREAM=${SPORTS_UPSTREAM_URL}`);
  log(`SCOREBOARD=${SPORTS_SCOREBOARD_ORIGIN}`);
  let anyResponse = 0;
  for (let n = 1; n <= TIMES; n += 1) {
    const url = ENDPOINTS[(n - 1) % ENDPOINTS.length];
    const r = await fetchOnce(n, url);
    if (r.status) anyResponse += 1;
    if (n < TIMES) {
      log(`WAIT ${GAP_MS / 1000}s before next try...`);
      await new Promise((r2) => setTimeout(r2, GAP_MS));
    }
  }
  log('--- VERDICT ---');
  log(`TOTAL TRIES: ${TIMES} | KOI RESPONSE AAYA: ${anyResponse}`);
  if (anyResponse === 0) {
    log('VERDICT: CONNECT NAHI HO RAHA — upstream se koi response nahi aaya. Upstream down / block / URL galat.');
  } else {
    log('VERDICT: CONNECT HO RAHA HAI — upstream respond kar raha hai. Agar game me round/odds nahi aa rahe to problem backend ke feed parse / socket wale hisse ki hai, upstream connect ki nahi.');
  }
  log('DONE direct upstream check');
}

main().catch((err) => {
  log(`FATAL ${err.message}`);
  process.exit(1);
});
