#!/usr/bin/env node
/**
 * Fetch UTC D1 candles for reported pairs and print classifyDay / computeLiveBias
 * inputs. Requires a running observer API (default http://localhost:8000).
 *
 * Usage:
 *   node scripts/repro-dol-bias.mjs
 *   OBSERVER_URL=http://localhost:8000 AUTH_TOKEN=... node scripts/repro-dol-bias.mjs
 */

const PAIRS = ["CADJPY", "US500", "NAS100", "NZDUSD", "AUDUSD"];
const BASE = process.env.OBSERVER_URL ?? "http://localhost:8000";
const TOKEN = process.env.AUTH_TOKEN ?? "";

async function fetchJson(path) {
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function last(arr) {
  return arr[arr.length - 1];
}

async function reproPair(pair) {
  const closed = await fetchJson(
    `/historical/ohlc?pair=${pair}&interval=1d&limit=5`,
  );
  const forming = await fetchJson(
    `/historical/ohlc-with-forming?pair=${pair}&interval=1d&limit=2`,
  );
  const closedCandles = closed.candles ?? [];
  const fc = forming.forming_candle ?? null;
  const d1 = last(closedCandles);
  const d0 = closedCandles.length >= 2 ? closedCandles[closedCandles.length - 2] : null;

  console.log(`\n=== ${pair} ===`);
  if (!d1) {
    console.log("  No closed daily candles");
    return;
  }
  console.log(`  PDH/PDL from ${d1.timestamp}: H=${d1.high} L=${d1.low}`);
  if (d0) {
    console.log(
      `  Classified ${d1.timestamp} vs prior H=${d0.high} L=${d0.low}: O=${d1.open} H=${d1.high} L=${d1.low} C=${d1.close}`,
    );
  }
  if (fc) {
    console.log(
      `  Forming ${fc.timestamp}: O=${fc.open} H=${fc.high} L=${fc.low} C=${fc.close}`,
    );
  } else {
    console.log("  Forming: none");
  }
}

async function main() {
  console.log(`Observer: ${BASE}`);
  for (const pair of PAIRS) {
    try {
      await reproPair(pair);
    } catch (err) {
      console.error(`\n=== ${pair} === ERROR:`, err.message);
    }
  }
}

main();
