/**
 * Setup-Edge Audit (Mode A)
 *
 * Question: do Alex's posted equity-trades setups have positive expectancy when
 * followed MECHANICALLY (enter at posted entry, exit at 2R target or SL),
 * ignoring his discretionary management?
 *
 * Ground truth = Yahoo daily OHLC (same source the app uses, no API key).
 * Conservative tie-break: if a single bar touches BOTH stop and target, we
 * record the STOP — the edge can never be flattered by intrabar ambiguity.
 *
 * Run from repo root:  npx tsx audit/setup-edge.ts
 * Outputs:  audit/calls.csv  +  audit/leaderboard.md
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXPORT = path.join(ROOT, 'data/discord-exports/equity-trades.json');
const CACHE = path.join(ROOT, 'audit/.cache');
const OUT_CSV = path.join(ROOT, 'audit/calls.csv');
const OUT_MD = path.join(ROOT, 'audit/leaderboard.md');

type Bar = { date: string; high: number; low: number; close: number };
type Call = {
  date: string; ts: string; dir: 'Long' | 'Short'; size: number;
  ticker: string; entry: number; sl: number; target: number;
};
type Result = Call & {
  riskPerShare: number; outcome: 'TARGET' | 'STOP' | 'OPEN' | 'NO_DATA';
  barsToResolve: number | null; r: number | null;
};

// Alex's posted format: "Long 13% SHOP @ 80.345 (SL @ 79.55) (EC risk : -0.13%) (2R @ 81.94)"
const CALL_RE =
  /(Long|Short)\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+).*?2R\s*@\s*([\d.]+)/is;

function parseCalls(): Call[] {
  const raw = JSON.parse(fs.readFileSync(EXPORT, 'utf8'));
  const calls: Call[] = [];
  for (const m of raw.messages) {
    const c: string = m.content || '';
    const hit = CALL_RE.exec(c);
    if (!hit) continue;
    calls.push({
      date: m.timestamp.slice(0, 10),
      ts: m.timestamp,
      dir: hit[1][0].toUpperCase() === 'L' ? 'Long' : 'Short',
      size: parseFloat(hit[2]),
      ticker: hit[3].toUpperCase(),
      entry: parseFloat(hit[4]),
      sl: parseFloat(hit[5]),
      target: parseFloat(hit[6]),
    });
  }
  return calls;
}

async function fetchOHLC(ticker: string): Promise<Bar[] | null> {
  const cacheFile = path.join(CACHE, `${ticker}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const p1 = Math.floor(new Date('2024-09-01').getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?period1=${p1}&period2=${p2}&interval=1d`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res?.timestamp) return null;
    const q = res.indicators.quote[0];
    const bars: Bar[] = res.timestamp
      .map((t: number, i: number) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        high: q.high[i], low: q.low[i], close: q.close[i],
      }))
      .filter((b: Bar) => b.high != null && b.low != null);
    fs.writeFileSync(cacheFile, JSON.stringify(bars));
    return bars;
  } catch {
    return null;
  }
}

function evaluate(call: Call, bars: Bar[]): Result {
  const risk = Math.abs(call.entry - call.sl);
  const base: Result = { ...call, riskPerShare: risk, outcome: 'OPEN', barsToResolve: null, r: null };
  if (risk === 0) return { ...base, outcome: 'NO_DATA' };
  const i0 = bars.findIndex((b) => b.date >= call.date);
  if (i0 < 0) return { ...base, outcome: 'NO_DATA' };
  for (let i = i0; i < bars.length; i++) {
    const b = bars[i];
    // STOP checked first => conservative on same-bar ties
    if (call.dir === 'Long') {
      if (b.low <= call.sl) return { ...base, outcome: 'STOP', barsToResolve: i - i0, r: -1 };
      if (b.high >= call.target)
        return { ...base, outcome: 'TARGET', barsToResolve: i - i0, r: (call.target - call.entry) / risk };
    } else {
      if (b.high >= call.sl) return { ...base, outcome: 'STOP', barsToResolve: i - i0, r: -1 };
      if (b.low <= call.target)
        return { ...base, outcome: 'TARGET', barsToResolve: i - i0, r: (call.entry - call.target) / risk };
    }
  }
  return base; // OPEN
}

// ---- reporting helpers --------------------------------------------------
function quarter(d: string): string {
  const [y, m] = d.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}
function stats(rows: Result[]) {
  const resolved = rows.filter((r) => r.outcome === 'TARGET' || r.outcome === 'STOP');
  const wins = resolved.filter((r) => r.outcome === 'TARGET').length;
  const open = rows.filter((r) => r.outcome === 'OPEN').length;
  const expR = resolved.length ? resolved.reduce((s, r) => s + (r.r as number), 0) / resolved.length : 0;
  return {
    n: rows.length, resolved: resolved.length, open,
    winRate: resolved.length ? wins / resolved.length : 0, expR,
  };
}
function group(rows: Result[], key: (r: Result) => string) {
  const m = new Map<string, Result[]>();
  for (const r of rows) {
    if (r.outcome === 'NO_DATA') continue;
    (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r);
  }
  return m;
}
function table(title: string, m: Map<string, Result[]>, minN = 1): string {
  const lines = [`### ${title}`, '', '| Bucket | N | Resolved | Win% | Exp (R) | Open |', '|---|--:|--:|--:|--:|--:|'];
  const entries = [...m.entries()].map(([k, v]) => [k, stats(v)] as const)
    .filter(([, s]) => s.n >= minN)
    .sort((a, b) => b[1].expR - a[1].expR);
  for (const [k, s] of entries)
    lines.push(`| ${k} | ${s.n} | ${s.resolved} | ${(s.winRate * 100).toFixed(0)}% | ${s.expR.toFixed(2)} | ${s.open} |`);
  return lines.join('\n') + '\n';
}

// ---- main ---------------------------------------------------------------
async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const calls = parseCalls();
  const tickers = [...new Set(calls.map((c) => c.ticker))];
  process.stdout.write(`Parsed ${calls.length} entry calls across ${tickers.length} tickers.\nFetching OHLC`);

  const ohlc = new Map<string, Bar[] | null>();
  for (const t of tickers) {
    ohlc.set(t, await fetchOHLC(t));
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const results: Result[] = calls.map((c) => {
    const bars = ohlc.get(c.ticker);
    return bars ? evaluate(c, bars) : { ...c, riskPerShare: Math.abs(c.entry - c.sl), outcome: 'NO_DATA', barsToResolve: null, r: null };
  });

  // calls.csv
  const csv = ['date,ticker,dir,size_pct,entry,sl,target_2r,risk_per_share,outcome,bars_to_resolve,R'];
  for (const r of results)
    csv.push([r.date, r.ticker, r.dir, r.size, r.entry, r.sl, r.target, r.riskPerShare.toFixed(4),
      r.outcome, r.barsToResolve ?? '', r.r != null ? r.r.toFixed(3) : ''].join(','));
  fs.writeFileSync(OUT_CSV, csv.join('\n'));

  const evaluable = results.filter((r) => r.outcome !== 'NO_DATA');
  const noData = results.length - evaluable.length;
  const o = stats(evaluable);

  const md: string[] = [
    '# Alex equity-trades — Setup-Edge Audit (Mode A, mechanical 2R/SL)',
    '',
    `Source: ${path.relative(ROOT, EXPORT)} · entries parsed: **${results.length}** · evaluable: **${evaluable.length}** · no price data: ${noData}`,
    `Outcome rule: enter at posted entry, exit at 2R target or SL, daily bars, **stop wins same-bar ties**. OPEN = neither hit by today.`,
    '',
    '## Overall',
    '',
    `- Resolved: **${o.resolved}** (still open: ${o.open})`,
    `- Win rate: **${(o.winRate * 100).toFixed(1)}%**`,
    `- Expectancy: **${o.expR.toFixed(3)} R per trade** ${o.expR > 0 ? '🟢' : '🔴'}`,
    '',
    table('By direction', group(evaluable, (r) => r.dir)),
    table('By quarter (entry)', group(evaluable, (r) => quarter(r.date))),
    table('By ticker (≥4 calls)', group(evaluable, (r) => r.ticker), 4),
    '',
    '_Verify any row: open calls.csv, find the message in equity-trades.json by date+ticker, chart it._',
  ];
  fs.writeFileSync(OUT_MD, md.join('\n'));

  console.log(`\nOVERALL  resolved=${o.resolved} open=${o.open} winRate=${(o.winRate * 100).toFixed(1)}% exp=${o.expR.toFixed(3)}R`);
  const byDir = group(evaluable, (r) => r.dir);
  for (const [k, v] of byDir) { const s = stats(v); console.log(`  ${k.padEnd(6)} n=${s.n} win=${(s.winRate * 100).toFixed(0)}% exp=${s.expR.toFixed(2)}R`); }
  console.log(`\nWrote ${path.relative(ROOT, OUT_CSV)} and ${path.relative(ROOT, OUT_MD)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
