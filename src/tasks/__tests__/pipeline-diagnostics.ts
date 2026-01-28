/**
 * Pipeline Diagnostics Test
 *
 * Validates every pipeline task's output quality, checks for
 * empty arrays, bad data, and tracks which fallback defaults are used.
 *
 * Usage: npx tsx src/tasks/__tests__/pipeline-diagnostics.ts
 */

// =============================================================================
// Imports - Tasks
// =============================================================================

import {
  analyzeMarketState,
  OHLCBar,
  BreadthData,
} from '../market-analysis';
import { MarketStateOutput } from '@/types/market-state';

import {
  scanLiquidLeaders,
  TickerData,
} from '../universe-scan';
import { UniverseScanOutput, UniverseLeader } from '@/types/universe';

import {
  scanPullbackCandidates,
  PullbackTickerData,
} from '../pullback-scan';
import { PullbackScanOutput } from '@/types/pullback';

import {
  evaluateReadiness,
  ReadinessTickerData,
} from '../entry-readiness';
import { ReadinessOutput, ReadinessRow } from '@/types/readiness';

import {
  rankFocusList,
  FocusListTickerData,
} from '../focus-list-ranking';
import { FocusListOutput, FocusListCandidate } from '@/types/focus-list';

import {
  calculatePositionSizing,
  SizingTickerData,
  PortfolioContext,
  MarketContext,
} from '../position-sizing';
import { SizingBatchOutput } from '@/types/sizing';

import {
  generateExecutionPlan,
  FullExecutionPlanOutput,
} from '../execution-plan';

import {
  calculatePortfolio,
  RawPosition,
  RecentTrade,
  AccountContext,
} from '../portfolio';
import { PortfolioOutput } from '@/types/portfolio';

import {
  generateOverview,
  RawTradeFill,
} from '../overview';
import { OverviewOutput } from '@/types/trades';

// =============================================================================
// Test Infrastructure
// =============================================================================

let passed = 0;
let failed = 0;
let warnings = 0;
const fallbacksUsed: string[] = [];
const qualityWarnings: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

function warn(message: string): void {
  warnings++;
  qualityWarnings.push(message);
}

function trackFallback(message: string): void {
  fallbacksUsed.push(message);
}

// =============================================================================
// Mock Data Generators (same as pipeline-test.ts)
// =============================================================================

function generateMockQQQEBars(): OHLCBar[] {
  const bars: OHLCBar[] = [];
  let price = 500;
  const now = new Date();
  for (let i = 34; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const open = price + (Math.random() - 0.45) * 5;
    const high = open + Math.random() * 3;
    const low = open - Math.random() * 3;
    const close = (open + high + low) / 3;
    bars.push({
      date: date.toISOString().split('T')[0],
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: Math.floor(1000000 + Math.random() * 5000000),
    });
    price = close;
  }
  return bars;
}

function generateMockBreadthData(): BreadthData {
  return {
    mco_z: 0.8,
    mcsi_z: 1.2,
    mcsi_10dma: 1.0,
    mcsi_z_prev: 1.1,
    mco_value: 30,
    mco_value_prev: 25,
    mcsi_value: 120,
    mcsi_value_prev: 115,
  };
}

function generateMockTickerUniverse(): TickerData[] {
  const tickers = [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'AMD', 'NFLX',
    'CRWD', 'PLTR', 'SNOW', 'DDOG', 'NET', 'MDB', 'ANET', 'SHOP', 'COIN', 'HOOD',
    'CRDO', 'VRT', 'CLS', 'APP', 'UBER', 'GEV', 'CEG', 'ALAB', 'DELL', 'RKLB',
  ];
  return tickers.map((ticker, i) => ({
    ticker,
    price: 100 + Math.random() * 400,
    adr_pct: 2.5 + Math.random() * 5,
    market_cap_b: 10 + Math.random() * 500,
    rs: 95 - i * 2,
    liquidity_m: 300 + Math.random() * 2000,
    volume_m: 2 + Math.random() * 20,
    dist_21ema_atr: -0.5 + Math.random() * 2,
    earnings_days: Math.floor(10 + Math.random() * 60),
    theme: 'Technology',
  }));
}

function enrichWithPullbackData(leaders: UniverseLeader[]): PullbackTickerData[] {
  return leaders.map(l => ({
    ...l,
    dist_50ema_atr: 0.5 + Math.random() * 3,
    close_range_pct: 20 + Math.random() * 60,
    is_contracting: Math.random() > 0.5,
    weekly_return_pct: -2 + Math.random() * 8,
    atr: l.price * (0.01 + Math.random() * 0.03),
    ema21_high: l.price * 1.02,
    ema21_close: l.price * 1.0,
    ema21_low: l.price * 0.98,
    close: l.price,
  }));
}

function enrichWithReadinessData(candidates: { ticker: string; rs: number; adr_pct: number }[]): ReadinessTickerData[] {
  return candidates.map((c, i) => {
    const price = 100 + Math.random() * 400;
    return {
      // PullbackCandidate base fields
      rank: i + 1,
      ticker: c.ticker,
      rs: c.rs,
      theme: 'Technology',
      price,
      adr_pct: c.adr_pct,
      dist_21_atr: -0.3 + Math.random() * 2,
      dist_50_atr: 0.5 + Math.random() * 3,
      close_pct: 30 + Math.random() * 50,
      contraction: Math.random() > 0.5,
      weekly_return_pct: -2 + Math.random() * 8,
      earnings_days: 15 + Math.floor(Math.random() * 60),
      ready_grade: 'B' as const,
      // ReadinessTickerData fields
      close: price,
      prev_close: price * (0.97 + Math.random() * 0.04),
      high: price * 1.02,
      low: price * 0.98,
      ema21_high: price * 1.01,
      ema21_close: price * 0.995,
      ema21_low: price * 0.98,
      prev_ema21_low: price * 0.975,
    };
  });
}

function enrichWithFocusData(rows: ReadinessRow[]): FocusListTickerData[] {
  return rows.map(r => ({
    // ReadinessRow base fields
    ticker: r.ticker,
    ready: r.ready,
    mode: r.mode,
    dist_to_21ema_atr: r.dist_to_21ema_atr,
    earnings_days: r.earnings_days,
    setup: r.setup,
    entry_trigger: r.entry_trigger,
    // FocusListTickerData fields
    ready_grade: 'B' as const,
    contraction: Math.random() > 0.5,
    close_range_pct: 30 + Math.random() * 50,
    rs: 80 + Math.floor(Math.random() * 15),
    theme: 'Technology',
    price: 100 + Math.random() * 400,
  }));
}

function enrichWithSizingData(candidates: FocusListCandidate[]): SizingTickerData[] {
  return candidates.map(c => {
    const price = c.price ?? (100 + Math.random() * 400);
    return {
      // FocusListCandidate base fields
      ...c,
      // SizingTickerData fields
      price,
      ema21_low: price * 0.98,
      atr: price * 0.02,
      earnings_days: c.earnings_days ?? 30,
    };
  });
}

function generateMockPositions(): RawPosition[] {
  return [
    { ticker: 'NVDA', shares: 50, avg_price: 140, ssl: 130, last_price: 180, mode: 'MODE2', theme: 'AI/Compute', trim_2r_price: 160, status: 'open' },
    { ticker: 'PLTR', shares: 100, avg_price: 155, ssl: 147, last_price: 175, mode: 'MODE1', theme: 'AI/Compute', trim_2r_price: 171, trimmed_pct: 33, status: 'open' },
  ];
}

function generateMockTrades(): RecentTrade[] {
  return [
    { ticker: 'NVDA', side: 'BUY', action_type: 'ENTRY', shares: 50, price: 140, executed_at: new Date().toISOString(), notes: 'test', mode: 'MODE2' },
  ];
}

function generateMockFills(): RawTradeFill[] {
  return [
    { ticker: 'NVDA', side: 'BUY', action_type: 'ENTRY', shares: 50, price: 140, executed_at: new Date().toISOString(), notes: 'test', mode: 'MODE2' },
  ];
}

// =============================================================================
// Quality Validators (the new part)
// =============================================================================

function validateTask1Quality(output: MarketStateOutput): void {
  assert(output.state !== undefined, 'Task 1: state is defined');
  assert(output.permissions !== undefined, 'Task 1: permissions is defined');
  assert(output.qqqe_structure_position !== undefined, 'Task 1: qqqe_structure_position is defined');

  if (!output.mco_z) {
    trackFallback('Task 1: breadth data missing — using defaults');
  }
  if (!output.permissions) {
    trackFallback('Task 1: permissions missing — will use default (new_entries=YES)');
  }

  // Quality checks
  if (output.mco_z !== undefined) {
    if (output.mco_z < -5 || output.mco_z > 5) warn(`Task 1: MCO Z-score out of range: ${output.mco_z}`);
  }
}

function validateTask2Quality(output: UniverseScanOutput): void {
  assert(output.count !== undefined, 'Task 2: count is defined');
  assert(Array.isArray(output.tickers), 'Task 2: tickers is array');
  assert(Array.isArray(output.leaders), 'Task 2: leaders is array');

  if (output.count === 0) {
    warn('Task 2: CRITICAL — universe is empty (0 leaders)');
    trackFallback('Task 2: empty universe — all downstream tasks will be empty');
  } else if (output.count < 20) {
    warn(`Task 2: LOW — only ${output.count} leaders (expected 30-75)`);
  }

  // Duplicate check
  const unique = new Set(output.tickers);
  if (unique.size !== output.tickers.length) {
    warn(`Task 2: ${output.tickers.length - unique.size} duplicate tickers`);
  }

  // Data quality
  for (const l of output.leaders) {
    if (!l.ticker) warn('Task 2: leader with empty ticker');
    if (l.rs < 1 || l.rs > 99) warn(`Task 2: ${l.ticker} RS out of range: ${l.rs}`);
    if (l.price <= 0) warn(`Task 2: ${l.ticker} invalid price: ${l.price}`);
    if (l.adr_pct <= 0 || l.adr_pct > 50) warn(`Task 2: ${l.ticker} ADR suspicious: ${l.adr_pct}`);
  }
}

function validateTask3Quality(output: PullbackScanOutput): void {
  assert(output.count !== undefined, 'Task 3: count is defined');
  assert(Array.isArray(output.candidates), 'Task 3: candidates is array');

  if (output.count === 0) {
    warn('Task 3: no pullback candidates found');
  }

  for (const c of output.candidates) {
    if (isNaN(c.dist_21_atr)) warn(`Task 3: ${c.ticker} dist_21_atr is NaN`);
    if (c.rs < 1 || c.rs > 99) warn(`Task 3: ${c.ticker} RS out of range: ${c.rs}`);
  }
}

function validateTask4Quality(output: ReadinessOutput): void {
  assert(Array.isArray(output.rows), 'Task 4: rows is array');

  if (output.rows.length === 0) {
    trackFallback('Task 4: no readiness rows — Task 5 will use Supabase cache fallback');
  }

  const readyCount = output.rows.filter(r => r.ready).length;
  if (output.rows.length > 0 && readyCount === 0) {
    warn('Task 4: ALL candidates NOT READY — no trades possible');
  }

  for (const r of output.rows) {
    if (r.earnings_days !== undefined && r.earnings_days === 30) {
      trackFallback(`Task 4: ${r.ticker} earnings_days=30 (default fallback)`);
    }
    if (!['MODE1', 'MODE2'].includes(r.mode)) warn(`Task 4: ${r.ticker} invalid mode: ${r.mode}`);
  }
}

function validateTask5Quality(output: FocusListOutput): void {
  assert(Array.isArray(output.top5), 'Task 5: top5 is array');
  assert(Array.isArray(output.candidates), 'Task 5: candidates is array');

  if (output.candidates.length === 0) {
    warn('Task 5: empty focus list');
    trackFallback('Task 5: no candidates — sizing will have nothing to process');
  }
  if (output.top5.length === 0 && output.candidates.length > 0) {
    warn('Task 5: candidates exist but top5 is empty');
  }
}

function validateTask6Quality(output: SizingBatchOutput): void {
  assert(Array.isArray(output.sizing), 'Task 6: sizing is array');

  const passCount = output.sizing.filter(s => s.gate === 'PASS').length;
  const withholdCount = output.sizing.filter(s => s.gate === 'WITHHOLD').length;

  if (output.sizing.length > 0 && passCount === 0) {
    warn(`Task 6: ALL ${output.sizing.length} positions WITHHELD`);
  }

  for (const s of output.sizing) {
    if (s.shares <= 0 && s.gate === 'PASS') warn(`Task 6: ${s.ticker} PASS but 0 shares`);
    if (isNaN(s.position_dollars)) warn(`Task 6: ${s.ticker} position_dollars is NaN`);
    if (s.ec_risk_percent < 0 || s.ec_risk_percent > 5) {
      warn(`Task 6: ${s.ticker} risk % suspicious: ${s.ec_risk_percent}`);
    }
  }
}

function validateTask7Quality(output: FullExecutionPlanOutput): void {
  assert(output.passed !== undefined, 'Task 7: passed trades defined');
  assert(output.withheld !== undefined, 'Task 7: withheld trades defined');
}

function validateTask8Quality(output: PortfolioOutput): void {
  assert(Array.isArray(output.positions), 'Task 8: positions is array');

  for (const p of output.positions) {
    if (isNaN(p.pnl_pct)) warn(`Task 8: ${p.ticker} pnl_pct is NaN`);
    if (p.current_price <= 0) warn(`Task 8: ${p.ticker} invalid current_price: ${p.current_price}`);
    if (p.shares <= 0) warn(`Task 8: ${p.ticker} invalid shares: ${p.shares}`);
  }
}

function validateTask9Quality(output: OverviewOutput): void {
  assert(output.trades_today !== undefined, 'Task 9: trades_today defined');
}

// =============================================================================
// Main Test Run
// =============================================================================

async function runDiagnostics() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Pipeline Diagnostics Test');
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // ── Task 1: Market Analysis ──────────────────────────────────────────
  console.log('\n── Task 1: Market Analysis ──');
  const bars = generateMockQQQEBars();
  const breadth = generateMockBreadthData();
  const marketState = analyzeMarketState(bars, breadth);
  validateTask1Quality(marketState);
  console.log(`  State: ${marketState.state}, Entries: ${marketState.permissions?.new_entries}`);

  // ── Task 2: Universe Scan ────────────────────────────────────────────
  console.log('\n── Task 2: Universe Scan ──');
  const tickerData = generateMockTickerUniverse();
  const universe = scanLiquidLeaders(tickerData);
  validateTask2Quality(universe);
  console.log(`  Leaders: ${universe.count}, Tickers: ${universe.tickers.length}`);

  // ── Task 3: Pullback Scan ────────────────────────────────────────────
  console.log('\n── Task 3: Pullback Scan ──');
  const pullbackData = enrichWithPullbackData(universe.leaders);
  const pullbacks = scanPullbackCandidates(pullbackData);
  validateTask3Quality(pullbacks);
  console.log(`  Candidates: ${pullbacks.count}`);

  // ── Task 4: Entry Readiness ──────────────────────────────────────────
  console.log('\n── Task 4: Entry Readiness ──');
  const readinessData = enrichWithReadinessData(
    pullbacks.candidates.map(c => ({ ticker: c.ticker, rs: c.rs, adr_pct: c.adr_pct }))
  );
  const readiness = evaluateReadiness(readinessData);
  validateTask4Quality(readiness);
  const readyCount = readiness.rows.filter(r => r.ready).length;
  console.log(`  Rows: ${readiness.rows.length}, Ready: ${readyCount}`);

  // ── Task 5: Focus List ───────────────────────────────────────────────
  console.log('\n── Task 5: Focus List Ranking ──');
  const focusData = enrichWithFocusData(readiness.rows);
  const focusList = rankFocusList(focusData);
  validateTask5Quality(focusList);
  console.log(`  Top5: [${focusList.top5.join(', ')}], Total: ${focusList.candidates.length}`);

  // ── Task 6: Position Sizing ──────────────────────────────────────────
  console.log('\n── Task 6: Position Sizing ──');
  const sizingData = enrichWithSizingData(focusList.candidates);
  const portfolioCtx: PortfolioContext = {
    equity: 100000,
    cash: 50000,
    open_positions: [],
    portfolio_ner_pct: 0,
  };
  const marketCtx: MarketContext = {
    mode: 'MODE2',
    market_state: (marketState.state ?? 'HEALTHY_BULL') as string,
    permissions: marketState.permissions ?? { new_entries: 'YES', adds: true, pressing: false, trims: true },
  };
  const sizing = calculatePositionSizing(sizingData, portfolioCtx, marketCtx);
  validateTask6Quality(sizing);
  const passedSizing = sizing.sizing.filter(s => s.gate === 'PASS').length;
  console.log(`  Total: ${sizing.sizing.length}, PASS: ${passedSizing}, WITHHOLD: ${sizing.sizing.length - passedSizing}`);

  // ── Task 7: Execution Plan ───────────────────────────────────────────
  console.log('\n── Task 7: Execution Plan ──');
  const execPlan = generateExecutionPlan(sizing);
  validateTask7Quality(execPlan);
  console.log(`  Passed: ${execPlan.passed?.length ?? 0}, Withheld: ${execPlan.withheld?.length ?? 0}`);

  // ── Task 8: Portfolio ────────────────────────────────────────────────
  console.log('\n── Task 8: Portfolio ──');
  const positions = generateMockPositions();
  const trades = generateMockTrades();
  const acctCtx: AccountContext = { equity: 100000, cash: 50000 };
  const portfolio = calculatePortfolio(positions, trades, acctCtx);
  validateTask8Quality(portfolio);
  console.log(`  Positions: ${portfolio.positions.length}`);

  // ── Task 9: Overview ─────────────────────────────────────────────────
  console.log('\n── Task 9: Overview ──');
  const fills = generateMockFills();
  const overview = generateOverview(fills);
  validateTask9Quality(overview);
  console.log(`  Trades today: ${overview.trades_today?.length ?? 0}`);

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSTICS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Assertions:  ${passed} passed, ${failed} failed`);
  console.log(`  Warnings:    ${warnings}`);
  console.log(`  Fallbacks:   ${fallbacksUsed.length}`);

  if (qualityWarnings.length > 0) {
    console.log('\n  Quality Warnings:');
    qualityWarnings.forEach(w => console.log(`    ⚠ ${w}`));
  }

  if (fallbacksUsed.length > 0) {
    console.log('\n  Fallbacks Used:');
    fallbacksUsed.forEach(f => console.log(`    → ${f}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log(`  RESULT: FAILED (${failed} failures)`);
    process.exit(1);
  } else {
    console.log(`  RESULT: PASSED (${passed} assertions, ${warnings} warnings)`);
    process.exit(0);
  }
}

// Run
runDiagnostics().catch(err => {
  console.error('Diagnostics crashed:', err);
  process.exit(1);
});
