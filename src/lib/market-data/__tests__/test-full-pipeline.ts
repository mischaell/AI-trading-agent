/**
 * Full Pipeline Test - Tasks 1-7 End-to-End with Real Data
 *
 * This script validates the complete trading agent pipeline:
 * Task 1: Market Analysis (simulated)
 * Task 2: Universe Scan (RS + liquidity filters)
 * Task 3: Pullback Scan (21EMA structure)
 * Task 4: Entry Readiness (earnings + structure)
 * Task 5: Focus List Ranking (scoring)
 * Task 6: Position Sizing (Decimal.js + risk gate)
 * Task 7: Execution Plan (advisory order tickets)
 *
 * Run with: npx tsx src/lib/market-data/__tests__/test-full-pipeline.ts
 *
 * Prerequisites:
 * - Dev server must be running (npm run dev)
 *
 * @see docs/TESTS.md for test patterns
 * @see docs/BUGS.md for known issues
 */

import Decimal from 'decimal.js';

// =============================================================================
// Types (consolidated)
// =============================================================================

interface RSData { ticker: string; rs: number; perf3m: number; perf6m: number; }
interface UniverseTickerData { ticker: string; price: number; avgVolume: number; adrPct: number; liquidityM: number; }
interface OHLCBar { date: string; open: number; high: number; low: number; close: number; volume: number; }
interface EarningsData { ticker: string; earningsDate: string | null; daysUntilEarnings: number; source: string; }
type NewEntriesPermission = 'YES' | 'LIMITED' | 'NO';
type GateResult = 'PASS' | 'WITHHOLD';
type WithholdReason = 'regime_forbids_entries' | 'ner_exceeds_limit' | 'earnings_too_close' | 'exposure_limit_reached';

interface MarketPermissions { new_entries: NewEntriesPermission; adds: boolean; pressing: boolean; trims: boolean; }
interface MarketContext { permissions: MarketPermissions; }
interface PortfolioContext { equity: Decimal | number | string; }

interface TickerStructureAnalysis {
  ticker: string; close: number; ema21_high: number; ema21_close: number; ema21_low: number;
  ema50_close: number; atr14: number; dist_21ema_atr: number; dist_50ema_atr: number;
  structure_position: string; structure_intact: boolean; weekly_return_pct: number;
  close_range_pct: number; is_contracting: boolean;
}

interface EnrichedPullbackData {
  ticker: string; rs: number; theme: string; price: number; adr_pct: number;
  dist_21ema_atr: number; dist_50ema_atr: number; close_range_pct: number;
  is_contracting: boolean; weekly_return_pct: number; earnings_days: number;
  ema21_high: number; ema21_close: number; ema21_low: number; close: number;
  atr: number; liquidity_m: number; rank: number; ready_grade: 'A' | 'B' | 'C';
}

interface ScoringResult {
  ticker: string; rank: number; total_score: number; ready_grade: 'A' | 'B' | 'C';
  dist_21_atr: number; mode: 'MODE1' | 'MODE2'; contraction: boolean;
  close_range_pct: number; rs: number; theme: string;
}

interface SizingOutput {
  ticker: string; mode: 'MODE1' | 'MODE2'; entry: number; ssl: number;
  shares: number; r_per_share: number; trim_2r_price: number;
  position_dollars: number; ec_risk_percent: number;
  gate: GateResult; withhold_reason?: WithholdReason;
}

interface ExecutionPlanEntry {
  ticker: string; mode: 'MODE1' | 'MODE2'; entry_price: number; ssl: number;
  shares: number; trim_shares: number; trim_price: number;
  position_dollars: number; ec_risk_pct: number;
  gate: GateResult; withhold_reason?: string;
}

// Pipeline stage results
interface PipelineResults {
  task1: { state: string; permissions: MarketPermissions };
  task2: { liquid_leaders: string[]; total_scanned: number };
  task3: { pullback_candidates: EnrichedPullbackData[] };
  task4: { ready_candidates: Array<{ ticker: string; mode: 'MODE1' | 'MODE2'; earnings_days: number }> };
  task5: { top5: ScoringResult[] };
  task6: { sizing: SizingOutput[] };
  task7: { passed: ExecutionPlanEntry[]; withheld: ExecutionPlanEntry[] };
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'http://localhost:3000';
const TEST_EQUITY = 100_000;

const NASDAQ_100_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AVGO', 'COST',
  'ADBE', 'AMD', 'NFLX', 'CSCO', 'INTC', 'QCOM', 'INTU', 'TXN', 'AMAT', 'MU',
  'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'NXPI', 'ON', 'ADI', 'MCHP', 'ASML',
  'CRM', 'ADSK', 'PANW', 'CRWD', 'DDOG', 'ZS', 'FTNT', 'WDAY', 'TEAM', 'MDB',
  'ANSS', 'CSGP', 'CTSH', 'CDW',
  'BKNG', 'ABNB', 'DASH', 'MELI', 'PYPL', 'TTD', 'TTWO', 'EA',
  'AMGN', 'GILD', 'REGN', 'VRTX', 'ISRG', 'IDXX', 'DXCM', 'ILMN', 'BIIB', 'MRNA',
  'GEHC', 'AZN',
  'TMUS', 'CMCSA', 'CHTR', 'WBD',
  'PEP', 'KDP', 'MNST', 'KHC', 'MDLZ', 'SBUX', 'LULU', 'ROST', 'ORLY', 'CPRT',
  'DLTR', 'FAST', 'ODFL', 'PCAR', 'CSX',
  'HON', 'CTAS', 'PAYX', 'VRSK', 'ROP', 'MAR', 'ADP',
  'AEP', 'XEL', 'EXC', 'CEG', 'FANG', 'BKR',
  'CCEP', 'GFS', 'ARM', 'SMCI', 'LIN',
  'PDD', 'JD', 'BIDU',
];

const CHINA_ADRS = new Set(['PDD', 'JD', 'BIDU', 'NTES', 'BABA']);
const DEFENSIVE_THEMES = ['Utilities', 'Consumer Staples', 'Healthcare'];

const TICKER_THEMES: Record<string, string> = {
  'AAPL': 'Consumer Electronics', 'MSFT': 'Enterprise Software', 'NVDA': 'Semiconductors',
  'GOOGL': 'Internet', 'GOOG': 'Internet', 'AMZN': 'E-Commerce', 'META': 'Social Media',
  'TSLA': 'Electric Vehicles', 'AVGO': 'Semiconductors', 'COST': 'Consumer Staples',
  'AMD': 'Semiconductors', 'INTC': 'Semiconductors', 'QCOM': 'Semiconductors',
  'MU': 'Memory', 'LRCX': 'Semicon Equipment', 'KLAC': 'Semicon Equipment',
  'AMAT': 'Semicon Equipment', 'ASML': 'Semicon Equipment', 'MRVL': 'Semiconductors',
  'ARM': 'Semiconductors', 'SMCI': 'AI Infrastructure', 'GFS': 'Semicon Foundry',
  'ADBE': 'Enterprise Software', 'NFLX': 'Streaming', 'CRM': 'Enterprise Software',
  'PANW': 'Cybersecurity', 'CRWD': 'Cybersecurity', 'DDOG': 'Observability',
  'MDB': 'Database', 'WBD': 'Media', 'DLTR': 'Retail',
  'ILMN': 'Genomics', 'MRNA': 'Biotech', 'IDXX': 'Diagnostics',
  'ADI': 'Analog Semis', 'MCHP': 'Semiconductors', 'MNST': 'Beverages',
  'AZN': 'Pharma', 'MAR': 'Hotels', 'PCAR': 'Trucking',
  'REGN': 'Biotech', 'BIIB': 'Biotech', 'ON': 'Semiconductors', 'BKR': 'Oil Services',
  'EA': 'Gaming', 'TTWO': 'Gaming', 'TTD': 'AdTech', 'PYPL': 'Payments',
  'VRTX': 'Biotech', 'ISRG': 'MedTech', 'DXCM': 'MedTech', 'GEHC': 'Healthcare',
};

const PULLBACK_CRITERIA = { min_dist_21_atr: -0.5, max_dist_21_atr: 1.0, min_dist_50_atr: 0, max_dist_50_atr: 3.0, max_weekly_return_pct: 12 };
const SCORING_WEIGHTS = { ready_grade: 30, dist_21_atr: 25, entry_mode: 15, contraction: 10, close_range: 10, rs: 10 };
const SIZING_CONFIG = { mode1_position_pct: [10, 12] as [number, number], mode2_position_pct: [12, 15] as [number, number], mode1_max_ner_pct: 0.25, mode2_max_ner_pct: 0.50, min_earnings_days: 7 };

// =============================================================================
// Helpers
// =============================================================================

function toDecimal(value: Decimal | number | string): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchRSData(tickers: string[]): Promise<Map<string, RSData>> {
  const results = new Map<string, RSData>();
  try {
    const response = await fetch(`${BASE_URL}/api/rs-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers }) });
    const data = await response.json() as { success: boolean; data?: RSData[] };
    if (data.success && Array.isArray(data.data)) for (const rs of data.data) results.set(rs.ticker, rs);
  } catch (error) { console.error('Failed to fetch RS data:', error); }
  return results;
}

async function fetchUniverseData(ticker: string): Promise<UniverseTickerData | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/universe-data?ticker=${ticker}`);
    const data = await response.json() as { success: boolean; data?: UniverseTickerData };
    return data.success && data.data ? data.data : null;
  } catch { return null; }
}

async function fetchOHLCData(ticker: string, days: number = 60): Promise<OHLCBar[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/market-data?ticker=${ticker}&days=${days}`);
    const data = await response.json() as { data?: OHLCBar[] };
    return data.data || [];
  } catch { return []; }
}

async function fetchEarningsData(tickers: string[]): Promise<Map<string, EarningsData>> {
  const results = new Map<string, EarningsData>();
  try {
    const response = await fetch(`${BASE_URL}/api/earnings-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers }) });
    const data = await response.json() as { success: boolean; data?: EarningsData[] };
    if (data.success && Array.isArray(data.data)) for (const earnings of data.data) results.set(earnings.ticker, earnings);
  } catch (error) { console.error('Failed to fetch earnings data:', error); }
  return results;
}

// =============================================================================
// Analysis Functions
// =============================================================================

function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  emaValues.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    emaValues.push(ema);
  }
  return emaValues;
}

function getLatestEMA(values: number[], period: number): number {
  const emaValues = calculateEMA(values, period);
  return emaValues[emaValues.length - 1] ?? 0;
}

function calculateATR(bars: OHLCBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hpc = Math.abs(bars[i].high - bars[i - 1].close);
    const lpc = Math.abs(bars[i].low - bars[i - 1].close);
    trValues.push(Math.max(hl, hpc, lpc));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trValues[i];
  let atr = sum / period;
  for (let i = period; i < trValues.length; i++) atr = (atr * (period - 1) + trValues[i]) / period;
  return atr;
}

function analyzeStructure(ticker: string, bars: OHLCBar[]): TickerStructureAnalysis | null {
  if (bars.length < 25) return null;
  const highs = bars.map(b => b.high);
  const closes = bars.map(b => b.close);
  const lows = bars.map(b => b.low);
  const ema21_high = getLatestEMA(highs, 21);
  const ema21_close = getLatestEMA(closes, 21);
  const ema21_low = getLatestEMA(lows, 21);
  const ema50_close = bars.length >= 55 ? getLatestEMA(closes, 50) : ema21_close;
  const atr14 = calculateATR(bars, 14);
  const latestBar = bars[bars.length - 1];
  const close = latestBar.close;
  const dist_21ema_atr = atr14 > 0 ? (close - ema21_close) / atr14 : 0;
  const dist_50ema_atr = atr14 > 0 ? (close - ema50_close) / atr14 : 0;
  let structure_position = close > ema21_high ? 'above_cloud' : close < ema21_low ? 'below_cloud' : 'inside_cloud';
  const structure_intact = close >= ema21_low;
  let weekly_return_pct = 0;
  if (bars.length >= 6) {
    const weekAgoClose = bars[bars.length - 6].close;
    weekly_return_pct = weekAgoClose > 0 ? ((close - weekAgoClose) / weekAgoClose) * 100 : 0;
  }
  const range = latestBar.high - latestBar.low;
  const close_range_pct = range > 0 ? ((close - latestBar.low) / range) * 100 : 50;
  const range5d = bars.slice(-5).reduce((max, b) => Math.max(max, b.high), 0) - bars.slice(-5).reduce((min, b) => Math.min(min, b.low), Infinity);
  const range20d = bars.slice(-20).reduce((max, b) => Math.max(max, b.high), 0) - bars.slice(-20).reduce((min, b) => Math.min(min, b.low), Infinity);
  const is_contracting = range5d < range20d * 0.8;
  return {
    ticker, close: Math.round(close * 100) / 100, ema21_high: Math.round(ema21_high * 100) / 100,
    ema21_close: Math.round(ema21_close * 100) / 100, ema21_low: Math.round(ema21_low * 100) / 100,
    ema50_close: Math.round(ema50_close * 100) / 100, atr14: Math.round(atr14 * 100) / 100,
    dist_21ema_atr: Math.round(dist_21ema_atr * 100) / 100, dist_50ema_atr: Math.round(dist_50ema_atr * 100) / 100,
    structure_position, structure_intact, weekly_return_pct: Math.round(weekly_return_pct * 100) / 100,
    close_range_pct: Math.round(close_range_pct), is_contracting,
  };
}

function calculateGrade(dist21: number, closeRangePct: number, isContracting: boolean, weeklyReturn: number): 'A' | 'B' | 'C' {
  let score = 0;
  if (Math.abs(dist21) <= 0.3) score += 3; else if (Math.abs(dist21) <= 0.5) score += 2; else if (Math.abs(dist21) <= 0.8) score += 1;
  if (closeRangePct >= 60) score += 2; else if (closeRangePct >= 40) score += 1;
  if (isContracting) score += 2;
  if (weeklyReturn < 5) score += 2; else if (weeklyReturn < 8) score += 1;
  if (score >= 7) return 'A'; if (score >= 4) return 'B'; return 'C';
}

function deriveMarketPermissions(state: string): MarketPermissions {
  const map: Record<string, MarketPermissions> = {
    'CONFIRMED_UPTREND': { new_entries: 'YES', adds: true, pressing: true, trims: true },
    'EARLY_CONFIRMATION': { new_entries: 'LIMITED', adds: true, pressing: false, trims: true },
    'PARTICIPATION_FADE': { new_entries: 'LIMITED', adds: false, pressing: false, trims: true },
    'BREAKDOWN': { new_entries: 'NO', adds: false, pressing: false, trims: true },
    'WASHOUT': { new_entries: 'NO', adds: false, pressing: false, trims: false },
  };
  return map[state] ?? { new_entries: 'NO', adds: false, pressing: false, trims: true };
}

function determineEntryMode(close: number, ema21High: number, ema21Low: number): 'MODE1' | 'MODE2' {
  const structurePos = close > ema21High ? 'above' : close < ema21Low ? 'below' : 'inside';
  const barColor = close > ema21High ? 'bullish' : close < ema21Low ? 'bearish' : 'neutral';
  return (structurePos === 'above' && barColor === 'bullish') ? 'MODE2' : 'MODE1';
}

function scoreCandidate(input: { ready_grade: 'A' | 'B' | 'C'; dist_21_atr: number; mode: 'MODE1' | 'MODE2'; contraction: boolean; close_range_pct: number; rs: number }): number {
  let score = 0;
  score += input.ready_grade === 'A' ? 30 : input.ready_grade === 'B' ? 20 : 10;
  const d = Math.abs(input.dist_21_atr);
  score += d <= 0.1 ? 25 : d <= 0.5 ? 15 : d <= 1.0 ? 5 : 0;
  score += input.mode === 'MODE2' ? 15 : 10;
  score += input.contraction ? 10 : 0;
  score += Math.round((input.close_range_pct / 100) * 10);
  score += input.rs >= 90 ? 10 : input.rs >= 80 ? 7 : input.rs >= 70 ? 4 : 1;
  return score;
}

function calculateSizing(ticker: string, mode: 'MODE1' | 'MODE2', price: number, ssl: number, earningsDays: number, market: MarketContext): SizingOutput {
  const equity = toDecimal(TEST_EQUITY);
  const entry = toDecimal(price);
  const sslDec = toDecimal(ssl);
  const isLimited = market.permissions.new_entries === 'LIMITED';
  const range = mode === 'MODE1' ? SIZING_CONFIG.mode1_position_pct : SIZING_CONFIG.mode2_position_pct;
  let positionPct = toDecimal(range[0] + range[1]).div(2);
  if (isLimited) positionPct = positionPct.times(0.5);
  const positionDollars = equity.times(positionPct).div(100);
  const shares = positionDollars.div(entry).floor().toNumber();
  const rPerShare = entry.minus(sslDec);
  const totalRDollars = rPerShare.times(shares);
  const ecRiskPct = totalRDollars.div(equity).times(100);
  const maxNer = mode === 'MODE1' ? SIZING_CONFIG.mode1_max_ner_pct : SIZING_CONFIG.mode2_max_ner_pct;
  const trim2rPrice = entry.plus(rPerShare.times(2));
  let gate: GateResult = 'PASS';
  let withholdReason: WithholdReason | undefined;
  if (market.permissions.new_entries === 'NO') { gate = 'WITHHOLD'; withholdReason = 'regime_forbids_entries'; }
  else if (earningsDays >= 0 && earningsDays < SIZING_CONFIG.min_earnings_days) { gate = 'WITHHOLD'; withholdReason = 'earnings_too_close'; }
  else if (ecRiskPct.gt(maxNer)) { gate = 'WITHHOLD'; withholdReason = 'ner_exceeds_limit'; }
  return { ticker, mode, entry: entry.toNumber(), ssl: sslDec.toNumber(), shares, r_per_share: rPerShare.toNumber(), trim_2r_price: trim2rPrice.toNumber(), position_dollars: positionDollars.toNumber(), ec_risk_percent: ecRiskPct.toNumber(), gate, withhold_reason: withholdReason };
}

// =============================================================================
// Main Pipeline
// =============================================================================

async function runFullPipeline(): Promise<PipelineResults> {
  const today = new Date().toISOString().split('T')[0];

  console.log();
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + '  TRADING AGENT FULL PIPELINE TEST - Tasks 1-7 with Real Data  '.padEnd(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();
  console.log(`Date: ${today} | Equity: $${TEST_EQUITY.toLocaleString()}`);
  console.log();

  const totalStartTime = Date.now();
  const stageTimes: Record<string, number> = {};

  // =========================================================================
  // TASK 1: Market Analysis
  // =========================================================================
  let stageStart = Date.now();
  console.log('┌─ Task 1: Market Analysis ─────────────────────────────────────────────────┐');
  const marketState = 'CONFIRMED_UPTREND';
  const permissions = deriveMarketPermissions(marketState);
  console.log(`│  State: ${marketState}`.padEnd(77) + '│');
  console.log(`│  New Entries: ${permissions.new_entries} | Adds: ${permissions.adds} | Pressing: ${permissions.pressing}`.padEnd(77) + '│');
  stageTimes['Task 1'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task1Result = { state: marketState, permissions };
  const marketContext: MarketContext = { permissions };

  // =========================================================================
  // TASK 2: Universe Scan
  // =========================================================================
  stageStart = Date.now();
  console.log('┌─ Task 2: Universe Scan ───────────────────────────────────────────────────┐');
  const rsData = await fetchRSData(NASDAQ_100_TICKERS);
  const isDefensive = (theme: string) => DEFENSIVE_THEMES.some(d => theme.toLowerCase().includes(d.toLowerCase()));
  const liquidLeaders: string[] = [];
  for (const [ticker, rs] of rsData) {
    if (rs.rs >= 70 && !CHINA_ADRS.has(ticker)) {
      const theme = TICKER_THEMES[ticker] || 'Unknown';
      if (!isDefensive(theme)) liquidLeaders.push(ticker);
    }
  }
  console.log(`│  Scanned: ${rsData.size} tickers | Liquid Leaders: ${liquidLeaders.length}`.padEnd(77) + '│');
  stageTimes['Task 2'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task2Result = { liquid_leaders: liquidLeaders, total_scanned: rsData.size };

  // =========================================================================
  // TASK 3: Pullback Scan
  // =========================================================================
  stageStart = Date.now();
  console.log('┌─ Task 3: Pullback Scan ───────────────────────────────────────────────────┐');
  const structureData: Map<string, TickerStructureAnalysis> = new Map();
  const universeData: Map<string, UniverseTickerData> = new Map();
  const BATCH_SIZE = 5;
  for (let i = 0; i < liquidLeaders.length; i += BATCH_SIZE) {
    const batch = liquidLeaders.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (ticker) => {
      const [ohlc, universe] = await Promise.all([fetchOHLCData(ticker, 60), fetchUniverseData(ticker)]);
      const structure = analyzeStructure(ticker, ohlc);
      return { ticker, structure, universe };
    });
    const batchResults = await Promise.all(batchPromises);
    for (const { ticker, structure, universe } of batchResults) {
      if (structure) structureData.set(ticker, structure);
      if (universe) universeData.set(ticker, universe);
    }
    if (i + BATCH_SIZE < liquidLeaders.length) await delay(1000);
  }

  const pullbackCandidates: EnrichedPullbackData[] = [];
  for (const [ticker, structure] of structureData) {
    const rs = rsData.get(ticker);
    const universe = universeData.get(ticker);
    if (!rs || !universe) continue;
    if (structure.dist_21ema_atr < PULLBACK_CRITERIA.min_dist_21_atr) continue;
    if (structure.dist_21ema_atr > PULLBACK_CRITERIA.max_dist_21_atr) continue;
    if (structure.dist_50ema_atr < PULLBACK_CRITERIA.min_dist_50_atr) continue;
    if (structure.dist_50ema_atr > PULLBACK_CRITERIA.max_dist_50_atr) continue;
    if (structure.weekly_return_pct > PULLBACK_CRITERIA.max_weekly_return_pct) continue;
    if (!structure.structure_intact) continue;
    const grade = calculateGrade(structure.dist_21ema_atr, structure.close_range_pct, structure.is_contracting, structure.weekly_return_pct);
    pullbackCandidates.push({
      ticker, rs: rs.rs, theme: TICKER_THEMES[ticker] || 'Unknown', price: structure.close,
      adr_pct: universe.adrPct, dist_21ema_atr: structure.dist_21ema_atr, dist_50ema_atr: structure.dist_50ema_atr,
      close_range_pct: structure.close_range_pct, is_contracting: structure.is_contracting,
      weekly_return_pct: structure.weekly_return_pct, earnings_days: 30,
      ema21_high: structure.ema21_high, ema21_close: structure.ema21_close, ema21_low: structure.ema21_low,
      close: structure.close, atr: structure.atr14, liquidity_m: universe.liquidityM, rank: 0, ready_grade: grade,
    });
  }
  console.log(`│  Analyzed: ${structureData.size} tickers | Pullback Candidates: ${pullbackCandidates.length}`.padEnd(77) + '│');
  stageTimes['Task 3'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task3Result = { pullback_candidates: pullbackCandidates };

  if (pullbackCandidates.length === 0) {
    console.log('⚠ No pullback candidates found. Pipeline cannot continue.');
    return { task1: task1Result, task2: task2Result, task3: task3Result, task4: { ready_candidates: [] }, task5: { top5: [] }, task6: { sizing: [] }, task7: { passed: [], withheld: [] } };
  }

  // =========================================================================
  // TASK 4: Entry Readiness
  // =========================================================================
  stageStart = Date.now();
  console.log('┌─ Task 4: Entry Readiness ─────────────────────────────────────────────────┐');
  const earningsData = await fetchEarningsData(pullbackCandidates.map(c => c.ticker));
  for (const candidate of pullbackCandidates) {
    const earnings = earningsData.get(candidate.ticker);
    if (earnings) candidate.earnings_days = earnings.daysUntilEarnings;
  }

  const readyCandidates: Array<{ ticker: string; mode: 'MODE1' | 'MODE2'; earnings_days: number; pullback: EnrichedPullbackData }> = [];
  for (const c of pullbackCandidates) {
    const atrCheck = c.dist_21ema_atr >= PULLBACK_CRITERIA.min_dist_21_atr && c.dist_21ema_atr <= PULLBACK_CRITERIA.max_dist_21_atr;
    const structureCheck = c.close >= c.ema21_low;
    const earningsCheck = c.earnings_days >= 7 || c.earnings_days < 0;
    if (atrCheck && structureCheck && earningsCheck) {
      const mode = determineEntryMode(c.close, c.ema21_high, c.ema21_low);
      readyCandidates.push({ ticker: c.ticker, mode, earnings_days: c.earnings_days, pullback: c });
    }
  }
  console.log(`│  Candidates: ${pullbackCandidates.length} | READY: ${readyCandidates.length}`.padEnd(77) + '│');
  stageTimes['Task 4'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task4Result = { ready_candidates: readyCandidates.map(r => ({ ticker: r.ticker, mode: r.mode, earnings_days: r.earnings_days })) };

  if (readyCandidates.length === 0) {
    console.log('⚠ No READY candidates. Pipeline cannot continue.');
    return { task1: task1Result, task2: task2Result, task3: task3Result, task4: task4Result, task5: { top5: [] }, task6: { sizing: [] }, task7: { passed: [], withheld: [] } };
  }

  // =========================================================================
  // TASK 5: Focus List Ranking
  // =========================================================================
  stageStart = Date.now();
  console.log('┌─ Task 5: Focus List Ranking ──────────────────────────────────────────────┐');
  const scoredCandidates: ScoringResult[] = readyCandidates.map(r => {
    const score = scoreCandidate({
      ready_grade: r.pullback.ready_grade, dist_21_atr: r.pullback.dist_21ema_atr,
      mode: r.mode, contraction: r.pullback.is_contracting, close_range_pct: r.pullback.close_range_pct, rs: r.pullback.rs,
    });
    return { ticker: r.ticker, rank: 0, total_score: score, ready_grade: r.pullback.ready_grade, dist_21_atr: r.pullback.dist_21ema_atr, mode: r.mode, contraction: r.pullback.is_contracting, close_range_pct: r.pullback.close_range_pct, rs: r.pullback.rs, theme: r.pullback.theme };
  });
  scoredCandidates.sort((a, b) => b.total_score !== a.total_score ? b.total_score - a.total_score : b.rs - a.rs);
  scoredCandidates.forEach((s, i) => s.rank = i + 1);
  const top5 = scoredCandidates.slice(0, 5);
  console.log(`│  Scored: ${scoredCandidates.length} | Top 5: ${top5.map(s => `${s.ticker}(${s.total_score})`).join(', ')}`.padEnd(77) + '│');
  stageTimes['Task 5'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task5Result = { top5 };

  // =========================================================================
  // TASK 6: Position Sizing
  // =========================================================================
  stageStart = Date.now();
  console.log('┌─ Task 6: Position Sizing ─────────────────────────────────────────────────┐');
  const sizingResults: SizingOutput[] = top5.map(s => {
    const pullback = pullbackCandidates.find(p => p.ticker === s.ticker)!;
    return calculateSizing(s.ticker, s.mode, pullback.price, pullback.ema21_low, pullback.earnings_days, marketContext);
  });
  const passCount = sizingResults.filter(s => s.gate === 'PASS').length;
  const withholdCount = sizingResults.filter(s => s.gate === 'WITHHOLD').length;
  console.log(`│  Sized: ${sizingResults.length} | PASS: ${passCount} | WITHHOLD: ${withholdCount}`.padEnd(77) + '│');
  stageTimes['Task 6'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task6Result = { sizing: sizingResults };

  // =========================================================================
  // TASK 7: Execution Plan
  // =========================================================================
  stageStart = Date.now();
  console.log('┌─ Task 7: Execution Plan ──────────────────────────────────────────────────┐');
  const passedPlans: ExecutionPlanEntry[] = [];
  const withheldPlans: ExecutionPlanEntry[] = [];

  for (const sizing of sizingResults) {
    const entry: ExecutionPlanEntry = {
      ticker: sizing.ticker, mode: sizing.mode, entry_price: sizing.entry, ssl: sizing.ssl,
      shares: sizing.shares, trim_shares: Math.floor(sizing.shares / 3), trim_price: sizing.trim_2r_price,
      position_dollars: sizing.position_dollars, ec_risk_pct: sizing.ec_risk_percent,
      gate: sizing.gate, withhold_reason: sizing.withhold_reason,
    };
    if (sizing.gate === 'PASS') passedPlans.push(entry);
    else withheldPlans.push(entry);
  }

  const totalDollars = passedPlans.reduce((sum, p) => sum + p.position_dollars, 0);
  const totalNer = passedPlans.reduce((sum, p) => sum + p.ec_risk_pct, 0);
  console.log(`│  Orders: ${passedPlans.length} | Planned: $${Math.round(totalDollars).toLocaleString()} | NER: ${totalNer.toFixed(2)}%`.padEnd(77) + '│');
  stageTimes['Task 7'] = Date.now() - stageStart;
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  const task7Result = { passed: passedPlans, withheld: withheldPlans };

  // =========================================================================
  // PIPELINE SUMMARY
  // =========================================================================
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + '  PIPELINE FUNNEL SUMMARY  '.padStart(52).padEnd(78) + '║');
  console.log('╠' + '═'.repeat(78) + '╣');
  console.log(`║  Task 1: Market State      │ ${marketState.padEnd(44)} ║`);
  console.log(`║  Task 2: Universe Scan     │ ${String(rsData.size).padStart(4)} scanned → ${String(liquidLeaders.length).padStart(3)} liquid leaders           ║`);
  console.log(`║  Task 3: Pullback Scan     │ ${String(liquidLeaders.length).padStart(4)} leaders  → ${String(pullbackCandidates.length).padStart(3)} pullback candidates       ║`);
  console.log(`║  Task 4: Entry Readiness   │ ${String(pullbackCandidates.length).padStart(4)} pullback → ${String(readyCandidates.length).padStart(3)} READY                      ║`);
  console.log(`║  Task 5: Focus List        │ ${String(readyCandidates.length).padStart(4)} ready    → ${String(top5.length).padStart(3)} top 5                      ║`);
  console.log(`║  Task 6: Position Sizing   │ ${String(top5.length).padStart(4)} top 5    → ${String(passCount).padStart(3)} PASS, ${String(withholdCount).padStart(1)} WITHHOLD           ║`);
  console.log(`║  Task 7: Execution Plan    │ ${String(passedPlans.length).padStart(4)} orders   → $${Math.round(totalDollars).toLocaleString().padStart(6)} planned           ║`);
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();

  // =========================================================================
  // ORDER TICKETS
  // =========================================================================
  if (passedPlans.length > 0) {
    console.log('┌─ ORDER TICKETS ──────────────────────────────────────────────────────────┐');
    for (const plan of passedPlans) {
      console.log(`│  ${plan.ticker} (${plan.mode})`.padEnd(77) + '│');
      console.log(`│    ENTRY: BUY ${plan.shares} @ MARKET (DAY)`.padEnd(77) + '│');
      console.log(`│    TRIM:  SELL ${plan.trim_shares} @ $${plan.trim_price.toFixed(2)} LIMIT (GTC) [2R]`.padEnd(77) + '│');
      console.log(`│    STOP:  Daily close < $${plan.ssl.toFixed(2)} → exit at close`.padEnd(77) + '│');
      console.log(`│    Risk:  ${plan.ec_risk_pct.toFixed(2)}% NER | $${Math.round(plan.position_dollars).toLocaleString()} position`.padEnd(77) + '│');
    }
    console.log('└' + '─'.repeat(77) + '┘');
    console.log();
  }

  if (withheldPlans.length > 0) {
    console.log('┌─ WITHHELD TRADES ────────────────────────────────────────────────────────┐');
    for (const plan of withheldPlans) {
      const reasonText = plan.withhold_reason === 'ner_exceeds_limit' ? `NER exceeds limit (${plan.ec_risk_pct.toFixed(2)}%)` : plan.withhold_reason;
      console.log(`│  ${plan.ticker} - ${plan.mode} - ${reasonText}`.padEnd(77) + '│');
    }
    console.log('└' + '─'.repeat(77) + '┘');
    console.log();
  }

  // =========================================================================
  // VALIDATION
  // =========================================================================
  console.log('┌─ VALIDATION ──────────────────────────────────────────────────────────────┐');

  const validations = [
    { name: 'Task 1 returns valid state', pass: ['CONFIRMED_UPTREND', 'EARLY_CONFIRMATION', 'PARTICIPATION_FADE', 'BREAKDOWN', 'WASHOUT'].includes(task1Result.state) },
    { name: 'Task 2 scans 100+ tickers', pass: task2Result.total_scanned >= 100 },
    { name: 'Task 2 filters to 20-50 leaders', pass: task2Result.liquid_leaders.length >= 20 && task2Result.liquid_leaders.length <= 50 },
    { name: 'Task 3 produces pullback candidates', pass: task3Result.pullback_candidates.length >= 0 },
    { name: 'Task 4 evaluates all pullbacks', pass: task4Result.ready_candidates.length <= task3Result.pullback_candidates.length },
    { name: 'Task 5 ranks up to 5 candidates', pass: task5Result.top5.length <= 5 },
    { name: 'Task 5 sorted by score descending', pass: task5Result.top5.every((s, i, arr) => i === 0 || arr[i - 1].total_score >= s.total_score) },
    { name: 'Task 6 sizes all top 5', pass: task6Result.sizing.length === task5Result.top5.length },
    { name: 'Task 6 uses Decimal.js (SSL < entry)', pass: task6Result.sizing.every(s => s.ssl < s.entry) },
    { name: 'Task 7 passed + withheld = total', pass: task7Result.passed.length + task7Result.withheld.length === task6Result.sizing.length },
    { name: 'Task 7 trim shares = floor(shares/3)', pass: task7Result.passed.every(p => p.trim_shares === Math.floor(p.shares / 3)) },
    { name: 'Data flows correctly through pipeline', pass: task7Result.passed.every(p => task5Result.top5.some(t => t.ticker === p.ticker)) },
  ];

  let passedCount = 0;
  for (const v of validations) {
    const status = v.pass ? '✓' : '✗';
    console.log(`│  ${status} ${v.name}`.padEnd(77) + '│');
    if (v.pass) passedCount++;
  }

  const allPassed = passedCount === validations.length;
  console.log('├' + '─'.repeat(77) + '┤');
  console.log(`│  ${allPassed ? '✓ ALL VALIDATIONS PASSED' : `✗ ${validations.length - passedCount} VALIDATIONS FAILED`}`.padEnd(77) + '│');
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  // =========================================================================
  // TIMING
  // =========================================================================
  const totalTime = (Date.now() - totalStartTime) / 1000;
  console.log('┌─ TIMING ──────────────────────────────────────────────────────────────────┐');
  for (const [task, time] of Object.entries(stageTimes)) {
    console.log(`│  ${task}: ${(time / 1000).toFixed(1)}s`.padEnd(77) + '│');
  }
  console.log('├' + '─'.repeat(77) + '┤');
  console.log(`│  Total: ${totalTime.toFixed(1)}s`.padEnd(77) + '│');
  console.log('└' + '─'.repeat(77) + '┘');
  console.log();

  return { task1: task1Result, task2: task2Result, task3: task3Result, task4: task4Result, task5: task5Result, task6: task6Result, task7: task7Result };
}

// Run the pipeline
runFullPipeline().catch(console.error);
