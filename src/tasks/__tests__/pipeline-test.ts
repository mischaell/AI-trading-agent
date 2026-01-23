/**
 * Pipeline Integration Test
 *
 * Runs all 9 tasks in sequence with mock data to verify
 * the complete trading agent pipeline works end-to-end.
 *
 * Usage: npx ts-node src/tasks/__tests__/pipeline-test.ts
 */

// =============================================================================
// Imports
// =============================================================================

// Task 1: Market Analysis
import {
  analyzeMarketState,
  OHLCBar,
  BreadthData,
} from '../market-analysis';
import { MarketStateOutput } from '@/types/market-state';

// Task 2: Universe Scan
import {
  scanLiquidLeaders,
  TickerData,
} from '../universe-scan';
import { UniverseScanOutput, UniverseLeader } from '@/types/universe';

// Task 3: Pullback Scan
import {
  scanPullbackCandidates,
  PullbackTickerData,
} from '../pullback-scan';
import { PullbackScanOutput } from '@/types/pullback';

// Task 4: Entry Readiness
import {
  evaluateReadiness,
  ReadinessTickerData,
} from '../entry-readiness';
import { ReadinessOutput, ReadinessRow } from '@/types/readiness';

// Task 5: Focus List Ranking
import {
  rankFocusList,
  FocusListTickerData,
} from '../focus-list-ranking';
import { FocusListOutput, FocusListCandidate } from '@/types/focus-list';

// Task 6: Position Sizing
import {
  calculatePositionSizing,
  SizingTickerData,
  PortfolioContext,
  MarketContext,
} from '../position-sizing';
import { SizingBatchOutput } from '@/types/sizing';

// Task 7: Execution Plan
import {
  generateExecutionPlan,
  FullExecutionPlanOutput,
} from '../execution-plan';

// Task 8: Portfolio
import {
  calculatePortfolio,
  RawPosition,
  RecentTrade,
  AccountContext,
} from '../portfolio';
import { PortfolioOutput } from '@/types/portfolio';

// Task 9: Overview
import {
  generateOverview,
  RawTradeFill,
} from '../overview';
import { OverviewOutput } from '@/types/trades';

// =============================================================================
// Types
// =============================================================================

interface PipelineResult {
  task1: MarketStateOutput;
  task2: UniverseScanOutput;
  task3: PullbackScanOutput;
  task4: ReadinessOutput;
  task5: FocusListOutput;
  task6: SizingBatchOutput;
  task7: FullExecutionPlanOutput;
  task8: PortfolioOutput;
  task9: OverviewOutput;
  summary: PipelineSummary;
}

interface PipelineSummary {
  universeCount: number;
  pullbackCount: number;
  readyCount: number;
  focusCount: number;
  passedGateCount: number;
  withheldCount: number;
  orderCount: number;
  positionCount: number;
  tradesTodayCount: number;
  marketState: string;
  permissions: {
    newEntries: boolean;
    adds: boolean;
    trims: boolean;
  };
}

// =============================================================================
// Mock Data Generators
// =============================================================================

/**
 * Generate mock QQQE OHLC bars for Task 1 (need at least 22 bars for EMA)
 */
function generateMockQQQEBars(): OHLCBar[] {
  const bars: OHLCBar[] = [];
  let basePrice = 95;

  // Generate 30 days of OHLC data with uptrend
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));

    // Gradual uptrend with some volatility
    basePrice = basePrice + (Math.random() * 0.8 - 0.2);
    const open = basePrice;
    const close = basePrice + (Math.random() * 1.5 - 0.5);
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;

    bars.push({
      date: date.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
    });

    basePrice = close;
  }

  return bars;
}

/**
 * Generate mock breadth data for Task 1
 */
function generateMockBreadthData(): BreadthData {
  return {
    mco_z: 0.85,
    mcsi_z: 1.20,
    mcsi_10dma: 1.05,
    mcsi_z_prev: 1.10,
  };
}

/**
 * Generate mock ticker universe for Task 2 (simulating Nasdaq-100)
 */
function generateMockTickerUniverse(): TickerData[] {
  const themes = [
    'AI Compute', 'Cloud', 'Semis', 'Software', 'Ads/AI',
    'E-commerce', 'Fintech', 'Cybersecurity', 'Networking', 'Auto/EV',
  ];

  const tickers: TickerData[] = [];

  // Generate 100 mock tickers
  const tickerNames = [
    'NVDA', 'META', 'GOOGL', 'AMZN', 'MSFT', 'AAPL', 'AVGO', 'AMD', 'TSLA', 'NFLX',
    'ANET', 'CRWD', 'PANW', 'SNOW', 'DDOG', 'MDB', 'PLTR', 'COIN', 'SHOP', 'SQ',
    'ADBE', 'CRM', 'NOW', 'INTU', 'TEAM', 'OKTA', 'ZS', 'FTNT', 'NET', 'CFLT',
    'SMCI', 'ARM', 'MRVL', 'KLAC', 'LRCX', 'AMAT', 'ASML', 'QCOM', 'TXN', 'ADI',
    'COST', 'WMT', 'TGT', 'HD', 'LOW', 'SBUX', 'MCD', 'NKE', 'LULU', 'DECK',
    'JPM', 'V', 'MA', 'AXP', 'GS', 'MS', 'BLK', 'SCHW', 'ICE', 'CME',
    'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'REGN',
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'VLO', 'PSX', 'HES',
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'WEC', 'ES',
    'PLD', 'AMT', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'DLR', 'AVB', 'EQR',
  ];

  for (let i = 0; i < tickerNames.length; i++) {
    const ticker = tickerNames[i];
    const rs = Math.max(50, 99 - i * 0.5 + Math.random() * 10);
    const isDefensive = i >= 60 && i < 90; // Utilities, Healthcare, Energy sectors
    const isChinaAdr = false;

    tickers.push({
      ticker,
      rs: Math.round(rs),
      adr_pct: 2.0 + Math.random() * 4,
      liquidity_m: 100 + Math.random() * 2000,
      price: 50 + Math.random() * 500,
      dist_21ema_atr: -0.5 + Math.random() * 1.5,
      earnings_days: Math.floor(7 + Math.random() * 60),
      theme: themes[i % themes.length],
      is_china_adr: isChinaAdr,
      is_defensive: isDefensive,
    });
  }

  return tickers;
}

/**
 * Enrich universe leaders with pullback scan data
 */
function enrichWithPullbackData(leaders: UniverseLeader[]): PullbackTickerData[] {
  return leaders.map((leader) => ({
    // From UniverseLeader
    rank: leader.rank,
    ticker: leader.ticker,
    rs: leader.rs,
    adr_pct: leader.adr_pct,
    liquidity_m: leader.liquidity_m,
    theme: leader.theme,
    price: leader.price,
    dist_21ema_atr: leader.dist_21ema_atr,
    earnings_days: leader.earnings_days,
    // PullbackTickerData additions
    dist_50ema_atr: 0.5 + Math.random() * 2,
    close_range_pct: 30 + Math.random() * 50,
    is_contracting: Math.random() > 0.3,
    weekly_return_pct: Math.random() * 10,
    atr: leader.price * (leader.adr_pct / 100),
    ema21_high: leader.price * 0.99,
    ema21_close: leader.price * 0.98,
    ema21_low: leader.price * 0.97,
    close: leader.price,
  }));
}

/**
 * Enrich pullback candidates with readiness data
 */
function enrichWithReadinessData(candidates: { ticker: string; rs: number; adr_pct: number; theme: string; dist_21_atr: number; earnings_days: number }[]): ReadinessTickerData[] {
  return candidates.map((c) => {
    const price = 100 + Math.random() * 400;
    const ema21_close = price * (1 - c.dist_21_atr * 0.02);
    const ema21_high = ema21_close * 1.01;
    const ema21_low = ema21_close * 0.99;

    return {
      ticker: c.ticker,
      rs: c.rs,
      adr_pct: c.adr_pct,
      theme: c.theme,
      dist_21_atr: c.dist_21_atr,
      earnings_days: c.earnings_days,
      close: price,
      prev_close: price * 0.99,
      high: price * 1.02,
      low: price * 0.98,
      ema21_high,
      ema21_close,
      ema21_low,
      prev_ema21_low: ema21_low * 0.995,
    };
  });
}

/**
 * Enrich readiness rows with focus list data
 * Produces FocusListTickerData for rankFocusList
 */
function enrichWithFocusData(rows: ReadinessRow[]): FocusListTickerData[] {
  const readyRows = rows.filter(r => r.ready);
  const grades: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
  const themes = ['AI Compute', 'Cloud', 'Semis', 'Software', 'Ads/AI'];

  return readyRows.map((r, i) => ({
    // From ReadinessRow
    ticker: r.ticker,
    ready: true, // Must be true for rankFocusList to consider it
    mode: r.mode,
    dist_to_21ema_atr: r.dist_to_21ema_atr,
    earnings_days: r.earnings_days ?? 20,
    setup: r.setup ?? 'Pullback to 21EMA',
    entry_trigger: r.entry_trigger ?? 'Close above prior high',
    // FocusListTickerData additions
    ready_grade: grades[i % 3], // Distribute A, B, C grades
    contraction: Math.random() > 0.3,
    close_range_pct: 50 + Math.random() * 40,
    rs: 85 + Math.random() * 14,
    theme: themes[i % themes.length],
    reclaim_backtest_grade: grades[i % 3] as 'A' | 'B' | 'C',
  }));
}

/**
 * Enrich focus list with sizing data
 * Creates realistic price/SSL ratios that pass risk gates
 */
function enrichWithSizingData(candidates: FocusListCandidate[]): SizingTickerData[] {
  return candidates.map((c) => {
    // Use realistic prices for tech stocks
    const price = 150 + Math.random() * 150; // $150-$300 range
    // SSL should be 1-2% below price for tight stops (realistic MODE1 setup)
    const ema21_low = price * 0.985; // 1.5% below price = tight stop
    const atr = price * 0.02; // 2% ATR is typical

    return {
      // From FocusListCandidate
      rank: c.rank,
      ticker: c.ticker,
      theme: c.theme,
      mode: c.mode,
      setup: c.setup,
      entry_trigger: c.entry_trigger,
      dist_to_21ema_atr: c.dist_to_21ema_atr,
      earnings_days: c.earnings_days,
      reclaim_backtest_grade: c.reclaim_backtest_grade,
      // SizingTickerData additions
      price,
      ema21_low,
      atr,
    };
  });
}

/**
 * Generate mock positions for Task 8
 */
function generateMockPositions(): RawPosition[] {
  return [
    {
      ticker: 'NVDA',
      shares: 10,
      avg_price: 450.00,
      last_price: 485.00,
      ssl: 435.00,
      trim_2r_price: 480.00,
      original_shares: 15,
      earnings_days: 28,
      dist_21_atr: 0.3,
      theme: 'AI Compute',
    },
    {
      ticker: 'META',
      shares: 8,
      avg_price: 380.00,
      last_price: 420.00,
      ssl: 365.00,
      trim_2r_price: 410.00,
      original_shares: 12,
      earnings_days: 14,
      dist_21_atr: 0.1,
      theme: 'Ads/AI',
    },
    {
      ticker: 'GOOGL',
      shares: 20,
      avg_price: 145.00,
      last_price: 152.00,
      ssl: 140.00,
      trim_2r_price: 155.00,
      original_shares: 20,
      earnings_days: 21,
      dist_21_atr: -0.2,
      theme: 'Search/AI',
    },
  ];
}

/**
 * Generate mock recent trades for Task 8
 */
function generateMockRecentTrades(): RecentTrade[] {
  return [
    {
      ticker: 'NVDA',
      side: 'SELL',
      action: 'TRIM',
      shares: 5,
      price: 480.00,
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      r_multiple: 2.0,
    },
    {
      ticker: 'META',
      side: 'SELL',
      action: 'TRIM',
      shares: 4,
      price: 410.00,
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      r_multiple: 2.0,
    },
  ];
}

/**
 * Generate mock trade fills for Task 9
 */
function generateMockTradeFills(): RawTradeFill[] {
  const now = Date.now();

  return [
    {
      timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      ticker: 'ANET',
      side: 'BUY',
      action_type: 'ENTRY',
      shares: 15,
      price: 285.50,
      mode: 'MODE1',
    },
    {
      timestamp: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      ticker: 'NVDA',
      side: 'SELL',
      action_type: 'TRIM',
      shares: 5,
      price: 480.00,
      r_multiple: 2.0,
    },
    {
      timestamp: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      ticker: 'META',
      side: 'SELL',
      action_type: 'TRIM',
      shares: 4,
      price: 410.00,
      r_multiple: 2.0,
    },
    {
      timestamp: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
      ticker: 'AMD',
      side: 'BUY',
      action_type: 'ENTRY',
      shares: 25,
      price: 165.00,
      mode: 'MODE2',
    },
  ];
}

// =============================================================================
// Validation Functions
// =============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function validateTask1(output: MarketStateOutput): void {
  assert(output.task === 'market_state', 'Task 1: task field should be "market_state"');
  assert(typeof output.state === 'string', 'Task 1: state should be string');
  assert(output.permissions !== undefined, 'Task 1: permissions should be defined');
  assert(typeof output.permissions.new_entries === 'string', 'Task 1: new_entries permission should be string');
  console.log('  ✓ Task 1 output validated');
}

function validateTask2(output: UniverseScanOutput): void {
  assert(output.task === 'universe_scan', 'Task 2: task field should be "universe_scan"');
  assert(Array.isArray(output.tickers), 'Task 2: tickers should be array');
  assert(output.count >= 0, 'Task 2: count should be non-negative');
  assert(output.leaders.length === output.count, 'Task 2: leaders length should match count');
  console.log('  ✓ Task 2 output validated');
}

function validateTask3(output: PullbackScanOutput): void {
  assert(output.task === 'pullback_scan', 'Task 3: task field should be "pullback_scan"');
  assert(Array.isArray(output.candidates), 'Task 3: candidates should be array');
  assert(typeof output.count === 'number', 'Task 3: count should be number');
  console.log('  ✓ Task 3 output validated');
}

function validateTask4(output: ReadinessOutput): void {
  assert(output.task === 'readiness', 'Task 4: task field should be "readiness"');
  assert(Array.isArray(output.rows), 'Task 4: rows should be array');
  assert(typeof output.ready_count === 'number', 'Task 4: ready_count should be number');
  console.log('  ✓ Task 4 output validated');
}

function validateTask5(output: FocusListOutput): void {
  assert(output.task === 'focus_list', 'Task 5: task field should be "focus_list"');
  assert(Array.isArray(output.top5), 'Task 5: top5 should be array');
  assert(output.top5.length <= 5, 'Task 5: top5 should have max 5 items');
  console.log('  ✓ Task 5 output validated');
}

function validateTask6(output: SizingBatchOutput): void {
  assert(output.task === 'sizing_batch', 'Task 6: task field should be "sizing_batch"');
  assert(Array.isArray(output.sizing), 'Task 6: sizing should be array');
  for (const s of output.sizing) {
    assert(s.gate === 'PASS' || s.gate === 'WITHHOLD', 'Task 6: gate should be PASS or WITHHOLD');
  }
  console.log('  ✓ Task 6 output validated');
}

function validateTask7(output: FullExecutionPlanOutput): void {
  assert(output.task === 'full_execution_plan', 'Task 7: task field should be "full_execution_plan"');
  assert(Array.isArray(output.passed), 'Task 7: passed should be array');
  assert(Array.isArray(output.withheld), 'Task 7: withheld should be array');
  assert(output.totals !== undefined, 'Task 7: totals should be defined');
  console.log('  ✓ Task 7 output validated');
}

function validateTask8(output: PortfolioOutput): void {
  assert(output.task === 'portfolio', 'Task 8: task field should be "portfolio"');
  assert(output.summary !== undefined, 'Task 8: summary should be defined');
  assert(Array.isArray(output.positions), 'Task 8: positions should be array');
  console.log('  ✓ Task 8 output validated');
}

function validateTask9(output: OverviewOutput): void {
  assert(output.task === 'overview', 'Task 9: task field should be "overview"');
  assert(Array.isArray(output.nav), 'Task 9: nav should be array');
  assert(Array.isArray(output.trades_today), 'Task 9: trades_today should be array');
  console.log('  ✓ Task 9 output validated');
}

// =============================================================================
// Logging Functions
// =============================================================================

function logTask1(output: MarketStateOutput): void {
  console.log(`  State: ${output.state}`);
  console.log(`  QQQE: ${output.qqqe_structure_position}, slope: ${output.qqqe_structure_slope}`);
  console.log(`  MCO z: ${output.mco_z.toFixed(2)}, MCSI z: ${output.mcsi_z.toFixed(2)}`);
  console.log(`  Permissions: entries=${output.permissions.new_entries}, adds=${output.permissions.adds}, trims=${output.permissions.trims}`);
  console.log('');
}

function logTask2(output: UniverseScanOutput): void {
  console.log(`  Found ${output.count} liquid leaders (target: 30-40)`);
  console.log(`  Top 5: ${output.tickers.slice(0, 5).join(', ')}`);
  console.log('');
}

function logTask3(output: PullbackScanOutput): void {
  console.log(`  Found ${output.count} pullback candidates (target: 5-10)`);
  const tickers = output.candidates.map(c => c.ticker).join(', ');
  console.log(`  Candidates: ${tickers || 'none'}`);
  console.log('');
}

function logTask4(output: ReadinessOutput): void {
  console.log(`  Ready: ${output.ready_count}, Not ready: ${output.not_ready_count}`);
  const readyTickers = output.rows.filter(r => r.ready).map(r => `${r.ticker}(${r.mode})`).join(', ');
  console.log(`  Ready for entry: ${readyTickers || 'none'}`);
  console.log('');
}

function logTask5(output: FocusListOutput): void {
  console.log(`  Focus list: ${output.top5.length} tickers`);
  console.log(`  Top 5: ${output.top5.join(', ')}`);
  if (output.candidates) {
    for (const c of output.candidates) {
      console.log(`    #${c.rank} ${c.ticker} (${c.mode}) - ${c.setup}`);
    }
  }
  console.log('');
}

function logTask6(output: SizingBatchOutput): void {
  const passed = output.sizing.filter(s => s.gate === 'PASS');
  const withheld = output.sizing.filter(s => s.gate === 'WITHHOLD');
  console.log(`  Passed gate: ${passed.length}, Withheld: ${withheld.length}`);
  for (const s of passed) {
    console.log(`    ${s.ticker}: ${s.shares} shares @ $${s.entry.toFixed(2)}, SSL=$${s.ssl.toFixed(2)}, NER=${s.ec_risk_percent.toFixed(2)}%`);
  }
  for (const s of withheld) {
    console.log(`    ${s.ticker}: WITHHELD (${s.withhold_reason})`);
  }
  console.log(`  Total planned: $${output.total_planned_dollars?.toLocaleString() ?? 0}`);
  console.log('');
}

function logTask7(output: FullExecutionPlanOutput): void {
  console.log(`  Orders: ${output.totals.order_count}, Withheld: ${output.totals.withheld_count}`);
  console.log(`  Total $: $${output.totals.total_dollars.toLocaleString()}, Total NER: ${output.totals.total_ner_pct.toFixed(2)}%`);
  for (const p of output.passed) {
    console.log(`    BUY ${p.entry.shares} ${p.ticker} @ ${p.entry.order_type}, 2R trim: ${p.profit.trim_2r.shares}@$${p.profit.trim_2r.price.toFixed(2)}`);
  }
  console.log('');
}

function logTask8(output: PortfolioOutput): void {
  const s = output.summary;
  console.log(`  Positions: ${s.position_count}, Gross exposure: ${s.gross_exposure.toFixed(1)}%`);
  console.log(`  NER: ${s.ner.toFixed(2)}%, Open heat: ${s.open_heat.toFixed(2)}%, Secured: ${s.secured_profits.toFixed(2)}%`);
  for (const p of output.positions) {
    console.log(`    ${p.ticker}: ${p.shares} shares, ${p.weight.toFixed(1)}% weight, ${(p.total_r ?? 0).toFixed(1)}R, ${p.status}`);
  }
  console.log('');
}

function logTask9(output: OverviewOutput): void {
  console.log(`  Nav items: ${output.nav.length}`);
  console.log(`  Trades today: ${output.trades_today.length}`);
  for (const t of output.trades_today) {
    const rStr = t.r_multiple !== undefined ? ` (${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple.toFixed(1)}R)` : '';
    console.log(`    ${t.time_utc} ${t.action} ${t.shares} ${t.ticker} @ $${t.price.toFixed(2)}${rStr}`);
  }
  console.log('');
}

// =============================================================================
// Summary Functions
// =============================================================================

function generateSummary(
  task1: MarketStateOutput,
  task2: UniverseScanOutput,
  task3: PullbackScanOutput,
  task4: ReadinessOutput,
  task5: FocusListOutput,
  task6: SizingBatchOutput,
  task7: FullExecutionPlanOutput,
  task8: PortfolioOutput,
  task9: OverviewOutput
): PipelineSummary {
  return {
    universeCount: task2.count,
    pullbackCount: task3.count,
    readyCount: task4.ready_count,
    focusCount: task5.top5.length,
    passedGateCount: task6.sizing.filter(s => s.gate === 'PASS').length,
    withheldCount: task6.sizing.filter(s => s.gate === 'WITHHOLD').length,
    orderCount: task7.totals.order_count,
    positionCount: task8.summary.position_count ?? 0,
    tradesTodayCount: task9.trades_today.length,
    marketState: task1.state,
    permissions: {
      newEntries: task1.permissions.new_entries === 'YES',
      adds: task1.permissions.adds,
      trims: task1.permissions.trims,
    },
  };
}

function printFunnelSummary(summary: PipelineSummary): void {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              PIPELINE FUNNEL SUMMARY                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Market State: ${summary.marketState.padEnd(45)}║`);
  console.log(`║  Permissions: entries=${summary.permissions.newEntries ? 'YES' : 'NO '}, adds=${summary.permissions.adds ? 'YES' : 'NO '}, trims=${summary.permissions.trims ? 'YES' : 'NO '}     ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  SCAN FUNNEL:                                                ║');
  console.log('║                                                              ║');
  console.log('║    100 tickers (Nasdaq-100 universe)                         ║');
  console.log('║      │                                                       ║');
  console.log('║      ▼ Task 2: Universe filters (RS, liquidity, ADR)         ║');
  console.log(`║    ${String(summary.universeCount).padStart(3)} liquid leaders                                       ║`);
  console.log('║      │                                                       ║');
  console.log('║      ▼ Task 3: Pullback scan (21EMA, contraction, etc)       ║');
  console.log(`║    ${String(summary.pullbackCount).padStart(3)} pullback candidates                                  ║`);
  console.log('║      │                                                       ║');
  console.log('║      ▼ Task 4: Readiness check (structure, earnings)         ║');
  console.log(`║    ${String(summary.readyCount).padStart(3)} ready for entry                                       ║`);
  console.log('║      │                                                       ║');
  console.log('║      ▼ Task 5: Ranking (score, top 5)                        ║');
  console.log(`║    ${String(summary.focusCount).padStart(3)} focus list                                            ║`);
  console.log('║      │                                                       ║');
  console.log('║      ▼ Task 6: Risk gate (NER, regime, earnings)             ║');
  console.log(`║    ${String(summary.passedGateCount).padStart(3)} passed, ${String(summary.withheldCount).padStart(2)} withheld                                  ║`);
  console.log('║      │                                                       ║');
  console.log('║      ▼ Task 7: Execution plan                                ║');
  console.log(`║    ${String(summary.orderCount).padStart(3)} order tickets generated                               ║`);
  console.log('║                                                              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  PORTFOLIO STATUS:                                           ║');
  console.log(`║    ${String(summary.positionCount).padStart(3)} open positions (Task 8)                               ║`);
  console.log(`║    ${String(summary.tradesTodayCount).padStart(3)} trades today (Task 9)                                 ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// =============================================================================
// Main Pipeline Execution
// =============================================================================

async function runPipeline(): Promise<PipelineResult> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           TRADING AGENT PIPELINE INTEGRATION TEST             ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Generate mock data
  const mockQQQEBars = generateMockQQQEBars();
  const mockBreadth = generateMockBreadthData();
  const mockUniverse = generateMockTickerUniverse();
  const mockPositions = generateMockPositions();
  const mockRecentTrades = generateMockRecentTrades();
  const mockTradeFills = generateMockTradeFills();
  const mockAccount: AccountContext = { equity: 100000, cash: 50000 };

  // ─────────────────────────────────────────────────────────────────────────
  // Task 1: Market Analysis
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 1: Market Analysis (QQQE + Breadth)                    │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task1 = analyzeMarketState(mockQQQEBars, mockBreadth);
  validateTask1(task1);
  logTask1(task1);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 2: Universe Scan
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 2: Universe Scan (Liquid Leaders)                      │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task2 = scanLiquidLeaders(mockUniverse);
  validateTask2(task2);
  logTask2(task2);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 3: Pullback Scan
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 3: Pullback Scan                                       │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task3Input = enrichWithPullbackData(task2.leaders);
  const task3 = scanPullbackCandidates(task3Input);
  validateTask3(task3);
  logTask3(task3);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 4: Entry Readiness
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 4: Entry Readiness                                     │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task4Input = enrichWithReadinessData(task3.candidates);
  const task4 = evaluateReadiness(task4Input);
  validateTask4(task4);
  logTask4(task4);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 5: Focus List Ranking
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 5: Focus List Ranking                                  │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task5Input = enrichWithFocusData(task4.rows);
  const task5 = rankFocusList(task5Input);
  validateTask5(task5);
  logTask5(task5);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 6: Position Sizing & Risk Gate
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 6: Position Sizing & Risk Gate                         │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task6Input = enrichWithSizingData(task5.candidates ?? []);
  const portfolioContext: PortfolioContext = { equity: mockAccount.equity };
  const marketContext: MarketContext = { permissions: task1.permissions };
  const task6 = calculatePositionSizing(task6Input, portfolioContext, marketContext);
  validateTask6(task6);
  logTask6(task6);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 7: Execution Plan
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 7: Execution Plan                                      │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task7 = generateExecutionPlan(task6);
  validateTask7(task7);
  logTask7(task7);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 8: Portfolio
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 8: Portfolio                                           │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task8 = calculatePortfolio(mockPositions, mockRecentTrades, mockAccount);
  validateTask8(task8);
  logTask8(task8);

  // ─────────────────────────────────────────────────────────────────────────
  // Task 9: Overview / Trades Today
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Task 9: Overview / Trades Today                             │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  const task9 = generateOverview(mockTradeFills);
  validateTask9(task9);
  logTask9(task9);

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  const summary = generateSummary(task1, task2, task3, task4, task5, task6, task7, task8, task9);
  console.log('');
  printFunnelSummary(summary);

  return {
    task1,
    task2,
    task3,
    task4,
    task5,
    task6,
    task7,
    task8,
    task9,
    summary,
  };
}

// =============================================================================
// Entry Point
// =============================================================================

runPipeline()
  .then((result) => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✓ PIPELINE TEST COMPLETED SUCCESSFULLY                       ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('  ✗ PIPELINE TEST FAILED                                       ');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    process.exit(1);
  });
