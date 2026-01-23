/**
 * Test Script for Task 4 (Entry Readiness) with Real Data
 *
 * This script tests the entry readiness pipeline:
 * 1. Runs Task 2 to get liquid leaders universe
 * 2. Runs Task 3 to get pullback candidates
 * 3. Fetches real earnings data from Yahoo Finance
 * 4. Evaluates each candidate for entry readiness
 *
 * Run with: npx tsx src/lib/market-data/__tests__/test-task4.ts
 *
 * Prerequisites:
 * - Dev server must be running (npm run dev)
 *
 * @see docs/TESTS.md for test patterns
 * @see docs/BUGS.md for known issues
 */

// =============================================================================
// Types
// =============================================================================

interface RSData {
  ticker: string;
  rs: number;
  perf3m: number;
  perf6m: number;
}

interface UniverseTickerData {
  ticker: string;
  price: number;
  avgVolume: number;
  adrPct: number;
  liquidityM: number;
}

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TickerStructureAnalysis {
  ticker: string;
  close: number;
  ema21_high: number;
  ema21_close: number;
  ema21_low: number;
  ema50_close: number;
  atr14: number;
  dist_21ema_atr: number;
  dist_50ema_atr: number;
  structure_position: string;
  structure_intact: boolean;
  weekly_return_pct: number;
  close_range_pct: number;
  is_contracting: boolean;
}

interface EnrichedPullbackData {
  ticker: string;
  rs: number;
  theme: string;
  price: number;
  adr_pct: number;
  dist_21ema_atr: number;
  dist_50ema_atr: number;
  close_range_pct: number;
  is_contracting: boolean;
  weekly_return_pct: number;
  earnings_days: number;
  ema21_high: number;
  ema21_close: number;
  ema21_low: number;
  close: number;
  atr: number;
  liquidity_m: number;
  rank: number;
  ready_grade: 'A' | 'B' | 'C';
}

interface EarningsData {
  ticker: string;
  earningsDate: string | null;
  daysUntilEarnings: number;
  source: string;
}

interface ReadinessOutput {
  task: string;
  rows: Array<{
    ticker: string;
    ready: boolean;
    mode: string;
    dist_to_21ema_atr: number;
    earnings_days?: number;
    setup?: string;
    entry_trigger?: string;
  }>;
  ready_count: number;
  not_ready_count: number;
}

interface DetailedReadinessResult {
  ticker: string;
  price: number;
  dist_21_atr: number;
  earnings_days: number;
  atr_check: { pass: boolean; value: number; min: number; max: number };
  structure_check: { pass: boolean; close: number; ma_low: number };
  earnings_check: { pass: boolean; days: number; min_required: number };
  bar_color: string;
  structure_position: string;
  ready: boolean;
  mode: string;
  reasons: string[];
  setup: string;
  trigger: string;
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'http://localhost:3000';

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

// Pullback filter criteria (from agent_skeleton)
const PULLBACK_CRITERIA = {
  min_dist_21_atr: -0.5,
  max_dist_21_atr: 1.0,
  min_dist_50_atr: 0,
  max_dist_50_atr: 3.0,
  min_close_range_pct: 20,
  max_weekly_return_pct: 12,
  require_structure_intact: true,
};

// =============================================================================
// API Functions
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRSData(tickers: string[]): Promise<Map<string, RSData>> {
  const results = new Map<string, RSData>();
  try {
    const response = await fetch(`${BASE_URL}/api/rs-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });
    const data = await response.json() as { success: boolean; data?: RSData[] };
    if (data.success && Array.isArray(data.data)) {
      for (const rs of data.data) {
        results.set(rs.ticker, rs);
      }
    }
  } catch (error) {
    console.error('Failed to fetch RS data:', error);
  }
  return results;
}

async function fetchUniverseData(ticker: string): Promise<UniverseTickerData | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/universe-data?ticker=${ticker}`);
    const data = await response.json() as { success: boolean; data?: UniverseTickerData };
    return data.success && data.data ? data.data : null;
  } catch {
    return null;
  }
}

async function fetchOHLCData(ticker: string, days: number = 60): Promise<OHLCBar[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/market-data?ticker=${ticker}&days=${days}`);
    const data = await response.json() as { data?: OHLCBar[] };
    return data.data || [];
  } catch {
    return [];
  }
}

async function fetchEarningsData(tickers: string[]): Promise<Map<string, EarningsData>> {
  const results = new Map<string, EarningsData>();
  try {
    const response = await fetch(`${BASE_URL}/api/earnings-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });
    const data = await response.json() as { success: boolean; data?: EarningsData[] };
    if (data.success && Array.isArray(data.data)) {
      for (const earnings of data.data) {
        results.set(earnings.ticker, earnings);
      }
    }
  } catch (error) {
    console.error('Failed to fetch earnings data:', error);
  }
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

  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }
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

  let structure_position: string;
  if (close > ema21_high && close > ema21_close && close > ema21_low) {
    structure_position = 'above_cloud';
  } else if (close < ema21_high && close < ema21_close && close < ema21_low) {
    structure_position = 'below_cloud';
  } else {
    structure_position = 'inside_cloud';
  }

  const structure_intact = close >= ema21_low;

  let weekly_return_pct = 0;
  if (bars.length >= 6) {
    const weekAgoClose = bars[bars.length - 6].close;
    weekly_return_pct = weekAgoClose > 0 ? ((close - weekAgoClose) / weekAgoClose) * 100 : 0;
  }

  const range = latestBar.high - latestBar.low;
  const close_range_pct = range > 0 ? ((close - latestBar.low) / range) * 100 : 50;

  const range5d = bars.slice(-5).reduce((max, b) => Math.max(max, b.high), 0) -
                  bars.slice(-5).reduce((min, b) => Math.min(min, b.low), Infinity);
  const range20d = bars.slice(-20).reduce((max, b) => Math.max(max, b.high), 0) -
                   bars.slice(-20).reduce((min, b) => Math.min(min, b.low), Infinity);
  const is_contracting = range5d < range20d * 0.8;

  return {
    ticker,
    close: Math.round(close * 100) / 100,
    ema21_high: Math.round(ema21_high * 100) / 100,
    ema21_close: Math.round(ema21_close * 100) / 100,
    ema21_low: Math.round(ema21_low * 100) / 100,
    ema50_close: Math.round(ema50_close * 100) / 100,
    atr14: Math.round(atr14 * 100) / 100,
    dist_21ema_atr: Math.round(dist_21ema_atr * 100) / 100,
    dist_50ema_atr: Math.round(dist_50ema_atr * 100) / 100,
    structure_position,
    structure_intact,
    weekly_return_pct: Math.round(weekly_return_pct * 100) / 100,
    close_range_pct: Math.round(close_range_pct),
    is_contracting,
  };
}

function calculateGrade(
  dist21: number,
  closeRangePct: number,
  isContracting: boolean,
  weeklyReturn: number
): 'A' | 'B' | 'C' {
  let score = 0;
  if (Math.abs(dist21) <= 0.3) score += 3;
  else if (Math.abs(dist21) <= 0.5) score += 2;
  else if (Math.abs(dist21) <= 0.8) score += 1;
  if (closeRangePct >= 60) score += 2;
  else if (closeRangePct >= 40) score += 1;
  if (isContracting) score += 2;
  if (weeklyReturn < 5) score += 2;
  else if (weeklyReturn < 8) score += 1;
  if (score >= 7) return 'A';
  if (score >= 4) return 'B';
  return 'C';
}

// =============================================================================
// Readiness Evaluation (Task 4 Logic)
// =============================================================================

function determineBarColor(
  close: number,
  ema21High: number,
  ema21Close: number,
  ema21Low: number
): string {
  if (close > ema21High && close > ema21Close && close > ema21Low) {
    return 'bullish';
  }
  if (close < ema21High && close < ema21Close && close < ema21Low) {
    return 'bearish';
  }
  return 'neutral';
}

function determineStructurePosition(
  close: number,
  ema21High: number,
  ema21Low: number
): string {
  if (close > ema21High) return 'above';
  if (close < ema21Low) return 'below';
  return 'inside';
}

function determineEntryMode(
  structurePosition: string,
  barColor: string
): { mode: string; setup: string; trigger: string } {
  // MODE2: Reclaim & Backtest - above structure with strength
  if (structurePosition === 'above' && barColor === 'bullish') {
    return {
      mode: 'MODE2',
      setup: '2) Reclaim & Backtest -> Higher Low',
      trigger: 'Strength reclaim (R2G / 21 high reclaim)',
    };
  }

  // MODE1: Weakness into structure - inside cloud or near it
  return {
    mode: 'MODE1',
    setup: '1) Uptrend Pullback -> Rising 21EMA',
    trigger: 'Weakness into 21 structure (retest)',
  };
}

function evaluateReadiness(
  data: EnrichedPullbackData
): DetailedReadinessResult {
  const { mode, setup, trigger } = determineEntryMode(
    determineStructurePosition(data.close, data.ema21_high, data.ema21_low),
    determineBarColor(data.close, data.ema21_high, data.ema21_close, data.ema21_low)
  );

  // ATR bounds check
  const atrCheck = {
    pass: data.dist_21ema_atr >= PULLBACK_CRITERIA.min_dist_21_atr &&
          data.dist_21ema_atr <= PULLBACK_CRITERIA.max_dist_21_atr,
    value: data.dist_21ema_atr,
    min: PULLBACK_CRITERIA.min_dist_21_atr,
    max: PULLBACK_CRITERIA.max_dist_21_atr,
  };

  // Structure intact check
  const structureCheck = {
    pass: data.close >= data.ema21_low,
    close: data.close,
    ma_low: data.ema21_low,
  };

  // Earnings check (-1 means unknown, which passes)
  const earningsCheck = {
    pass: data.earnings_days >= 7 || data.earnings_days < 0,
    days: data.earnings_days,
    min_required: 7,
  };

  // Overall readiness
  const ready = atrCheck.pass && structureCheck.pass && earningsCheck.pass;

  // Build reasons
  const reasons: string[] = [];
  if (!atrCheck.pass) {
    if (atrCheck.value < atrCheck.min) {
      reasons.push(`Dist to 21EMA (${atrCheck.value.toFixed(2)}) < min (${atrCheck.min})`);
    } else {
      reasons.push(`Dist to 21EMA (${atrCheck.value.toFixed(2)}) > max (${atrCheck.max})`);
    }
  }
  if (!structureCheck.pass) {
    reasons.push('Structure broken (close < MALow)');
  }
  if (!earningsCheck.pass) {
    reasons.push(`Earnings in ${earningsCheck.days}d < ${earningsCheck.min_required}d minimum`);
  }
  if (ready) {
    reasons.push('All readiness checks passed');
  }

  return {
    ticker: data.ticker,
    price: data.price,
    dist_21_atr: data.dist_21ema_atr,
    earnings_days: data.earnings_days,
    atr_check: atrCheck,
    structure_check: structureCheck,
    earnings_check: earningsCheck,
    bar_color: determineBarColor(data.close, data.ema21_high, data.ema21_close, data.ema21_low),
    structure_position: determineStructurePosition(data.close, data.ema21_high, data.ema21_low),
    ready,
    mode,
    reasons,
    setup,
    trigger,
  };
}

// =============================================================================
// Main Test
// =============================================================================

async function runTest() {
  console.log('='.repeat(70));
  console.log('Task 4 Entry Readiness Test - Real Yahoo Finance Data');
  console.log('='.repeat(70));
  console.log();

  const totalStartTime = Date.now();

  // =========================================================================
  // Step 1: Run Task 2 (Universe Scan)
  // =========================================================================
  console.log('Step 1: Running Task 2 (Universe Scan) to get liquid leaders...');
  console.log();

  const rsStartTime = Date.now();
  const rsData = await fetchRSData(NASDAQ_100_TICKERS);
  const rsTime = ((Date.now() - rsStartTime) / 1000).toFixed(1);
  console.log(`RS calculation complete in ${rsTime}s (${rsData.size} tickers)`);

  const isDefensive = (theme: string) =>
    DEFENSIVE_THEMES.some(d => theme.toLowerCase().includes(d.toLowerCase()));

  const liquidLeaders: string[] = [];
  for (const [ticker, rs] of rsData) {
    if (rs.rs >= 70 && !CHINA_ADRS.has(ticker)) {
      const theme = TICKER_THEMES[ticker] || 'Unknown';
      if (!isDefensive(theme)) {
        liquidLeaders.push(ticker);
      }
    }
  }

  console.log(`Liquid leaders (RS >= 70): ${liquidLeaders.length} tickers`);
  console.log();

  // =========================================================================
  // Step 2: Run Task 3 (Pullback Scan)
  // =========================================================================
  console.log('Step 2: Running Task 3 (Pullback Scan) to get candidates...');
  console.log();

  const structureData: Map<string, TickerStructureAnalysis> = new Map();
  const universeData: Map<string, UniverseTickerData> = new Map();

  const analysisStartTime = Date.now();
  const BATCH_SIZE = 5;

  for (let i = 0; i < liquidLeaders.length; i += BATCH_SIZE) {
    const batch = liquidLeaders.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (ticker) => {
      const [ohlc, universe] = await Promise.all([
        fetchOHLCData(ticker, 60),
        fetchUniverseData(ticker),
      ]);
      const structure = analyzeStructure(ticker, ohlc);
      return { ticker, structure, universe };
    });

    const batchResults = await Promise.all(batchPromises);

    for (const { ticker, structure, universe } of batchResults) {
      if (structure) structureData.set(ticker, structure);
      if (universe) universeData.set(ticker, universe);
    }

    const progress = Math.min(i + BATCH_SIZE, liquidLeaders.length);
    process.stdout.write(`\rAnalyzing structure: ${progress}/${liquidLeaders.length}`);

    if (i + BATCH_SIZE < liquidLeaders.length) {
      await delay(1000);
    }
  }
  console.log();

  const analysisTime = ((Date.now() - analysisStartTime) / 1000).toFixed(1);
  console.log(`Structure analysis complete in ${analysisTime}s`);
  console.log();

  // Apply pullback filters
  const pullbackCandidates: EnrichedPullbackData[] = [];

  for (const [ticker, structure] of structureData) {
    const rs = rsData.get(ticker);
    const universe = universeData.get(ticker);
    if (!rs || !universe) continue;

    // Apply filters
    if (structure.dist_21ema_atr < PULLBACK_CRITERIA.min_dist_21_atr) continue;
    if (structure.dist_21ema_atr > PULLBACK_CRITERIA.max_dist_21_atr) continue;
    if (structure.dist_50ema_atr < PULLBACK_CRITERIA.min_dist_50_atr) continue;
    if (structure.dist_50ema_atr > PULLBACK_CRITERIA.max_dist_50_atr) continue;
    if (structure.weekly_return_pct > PULLBACK_CRITERIA.max_weekly_return_pct) continue;
    if (!structure.structure_intact) continue;

    const grade = calculateGrade(
      structure.dist_21ema_atr,
      structure.close_range_pct,
      structure.is_contracting,
      structure.weekly_return_pct
    );

    pullbackCandidates.push({
      ticker,
      rs: rs.rs,
      theme: TICKER_THEMES[ticker] || 'Unknown',
      price: structure.close,
      adr_pct: universe.adrPct,
      dist_21ema_atr: structure.dist_21ema_atr,
      dist_50ema_atr: structure.dist_50ema_atr,
      close_range_pct: structure.close_range_pct,
      is_contracting: structure.is_contracting,
      weekly_return_pct: structure.weekly_return_pct,
      earnings_days: 30, // Will be updated with real data
      ema21_high: structure.ema21_high,
      ema21_close: structure.ema21_close,
      ema21_low: structure.ema21_low,
      close: structure.close,
      atr: structure.atr14,
      liquidity_m: universe.liquidityM,
      rank: 0,
      ready_grade: grade,
    });
  }

  // Sort by grade, then RS
  const gradeOrder = { A: 0, B: 1, C: 2 };
  pullbackCandidates.sort((a, b) => {
    const gradeCompare = gradeOrder[a.ready_grade] - gradeOrder[b.ready_grade];
    if (gradeCompare !== 0) return gradeCompare;
    return b.rs - a.rs;
  });

  // Take top 10
  const candidates = pullbackCandidates.slice(0, 10);
  candidates.forEach((c, i) => c.rank = i + 1);

  console.log(`Task 3 output: ${candidates.length} pullback candidates`);
  console.log('Tickers:', candidates.map(c => c.ticker).join(', ') || '(none)');
  console.log();

  if (candidates.length === 0) {
    console.log('No pullback candidates found. Cannot proceed to Task 4.');
    console.log('This is normal in strong trending markets with few pullbacks.');
    return;
  }

  // =========================================================================
  // Step 3: Fetch Real Earnings Data
  // =========================================================================
  console.log('Step 3: Fetching real earnings data from Yahoo Finance...');
  console.log();

  const earningsStartTime = Date.now();
  const earningsData = await fetchEarningsData(candidates.map(c => c.ticker));
  const earningsTime = ((Date.now() - earningsStartTime) / 1000).toFixed(1);
  console.log(`Earnings data fetched in ${earningsTime}s`);

  // Update candidates with real earnings data
  for (const candidate of candidates) {
    const earnings = earningsData.get(candidate.ticker);
    if (earnings) {
      candidate.earnings_days = earnings.daysUntilEarnings;
    }
  }

  console.log();
  console.log('Earnings Data:');
  console.log('-'.repeat(60));
  console.log(
    'Ticker'.padEnd(10) +
    'Earnings Date'.padEnd(15) +
    'Days Until'.padEnd(12) +
    'Source'
  );
  console.log('-'.repeat(60));

  for (const candidate of candidates) {
    const earnings = earningsData.get(candidate.ticker);
    console.log(
      candidate.ticker.padEnd(10) +
      (earnings?.earningsDate || 'Unknown').padEnd(15) +
      (candidate.earnings_days < 0 ? 'Unknown' : String(candidate.earnings_days)).padEnd(12) +
      (earnings?.source || 'unknown')
    );
  }
  console.log();

  // =========================================================================
  // Step 4: Run Task 4 (Entry Readiness)
  // =========================================================================
  console.log('Step 4: Evaluating entry readiness for each candidate...');
  console.log();

  const evaluations: DetailedReadinessResult[] = [];
  for (const candidate of candidates) {
    const result = evaluateReadiness(candidate);
    evaluations.push(result);
  }

  // =========================================================================
  // Step 5: Print Detailed Results
  // =========================================================================
  console.log('='.repeat(70));
  console.log('READINESS EVALUATION RESULTS');
  console.log('='.repeat(70));
  console.log();

  for (const eval_result of evaluations) {
    console.log(`${eval_result.ticker} (${eval_result.ready ? 'READY' : 'NOT READY'})`);
    console.log('-'.repeat(50));
    console.log(`  Price:     $${eval_result.price.toFixed(2)}`);
    console.log(`  ATR Check: ${eval_result.atr_check.pass ? '✓ PASS' : '✗ FAIL'} ` +
      `(${eval_result.atr_check.value.toFixed(2)} in [${eval_result.atr_check.min}, ${eval_result.atr_check.max}])`);
    console.log(`  Structure: ${eval_result.structure_check.pass ? '✓ PASS' : '✗ FAIL'} ` +
      `(close $${eval_result.structure_check.close.toFixed(2)} ${eval_result.structure_check.pass ? '>=' : '<'} MALow $${eval_result.structure_check.ma_low.toFixed(2)})`);
    console.log(`  Earnings:  ${eval_result.earnings_check.pass ? '✓ PASS' : '✗ FAIL'} ` +
      `(${eval_result.earnings_check.days < 0 ? 'unknown' : eval_result.earnings_check.days + ' days'}, min ${eval_result.earnings_check.min_required})`);
    console.log(`  Bar Color: ${eval_result.bar_color}`);
    console.log(`  Position:  ${eval_result.structure_position}`);
    console.log(`  Mode:      ${eval_result.mode}`);
    console.log(`  Setup:     ${eval_result.setup}`);
    console.log(`  Trigger:   ${eval_result.trigger}`);
    console.log();
  }

  // =========================================================================
  // Step 6: Build Output
  // =========================================================================
  const readyCount = evaluations.filter(e => e.ready).length;
  const notReadyCount = evaluations.filter(e => !e.ready).length;

  const output: ReadinessOutput = {
    task: 'readiness',
    rows: evaluations.map(e => ({
      ticker: e.ticker,
      ready: e.ready,
      mode: e.mode,
      dist_to_21ema_atr: e.dist_21_atr,
      earnings_days: e.earnings_days,
      setup: e.setup,
      entry_trigger: e.trigger,
    })),
    ready_count: readyCount,
    not_ready_count: notReadyCount,
  };

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log();
  console.log(`Candidates received from Task 3: ${candidates.length}`);
  console.log(`Ready for entry:                 ${readyCount}`);
  console.log(`Not ready:                       ${notReadyCount}`);
  console.log();

  if (readyCount > 0) {
    console.log('Ready Candidates:');
    console.log('-'.repeat(70));
    console.log(
      'Ticker'.padEnd(10) +
      'Mode'.padEnd(8) +
      'Dist21'.padEnd(10) +
      'Earnings'.padEnd(12) +
      'Bar'.padEnd(10) +
      'Position'
    );
    console.log('-'.repeat(70));

    for (const e of evaluations.filter(e => e.ready)) {
      console.log(
        e.ticker.padEnd(10) +
        e.mode.padEnd(8) +
        ((e.dist_21_atr >= 0 ? '+' : '') + e.dist_21_atr.toFixed(2)).padEnd(10) +
        (e.earnings_days < 0 ? 'unknown' : e.earnings_days + 'd').padEnd(12) +
        e.bar_color.padEnd(10) +
        e.structure_position
      );
    }
    console.log();
  }

  // =========================================================================
  // Validation
  // =========================================================================
  console.log('='.repeat(70));
  console.log('VALIDATION');
  console.log('='.repeat(70));

  const validations = [
    { name: 'Output has task field', pass: output.task === 'readiness' },
    { name: 'Has rows array', pass: Array.isArray(output.rows) },
    { name: 'Rows have required fields', pass: output.rows.every(r =>
      r.ticker && typeof r.ready === 'boolean' && r.mode
    )},
    { name: 'ready_count matches', pass: output.ready_count === output.rows.filter(r => r.ready).length },
    { name: 'not_ready_count matches', pass: output.not_ready_count === output.rows.filter(r => !r.ready).length },
    { name: 'All modes are MODE1/MODE2', pass: output.rows.every(r =>
      r.mode === 'MODE1' || r.mode === 'MODE2'
    )},
    { name: 'All dist_to_21ema_atr are numbers', pass: output.rows.every(r =>
      typeof r.dist_to_21ema_atr === 'number'
    )},
    { name: 'Ready candidates have passing checks', pass: evaluations.filter(e => e.ready).every(e =>
      e.atr_check.pass && e.structure_check.pass && e.earnings_check.pass
    )},
  ];

  for (const v of validations) {
    console.log(`${v.pass ? '✓' : '✗'} ${v.name}`);
  }

  const allPassed = validations.every(v => v.pass);
  console.log();
  console.log(allPassed ? '✓ ALL VALIDATIONS PASSED' : '✗ SOME VALIDATIONS FAILED');
  console.log();

  const totalTime = ((Date.now() - totalStartTime) / 1000).toFixed(1);
  console.log(`Total execution time: ${totalTime}s`);

  return output;
}

// Run the test
runTest().catch(console.error);
