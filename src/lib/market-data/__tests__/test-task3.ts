/**
 * Test Script for Task 3 (Pullback Scan) with Real Yahoo Finance Data
 *
 * This script tests the pullback scan pipeline:
 * 1. First runs Task 2 to get real universe (liquid leaders)
 * 2. Then analyzes each ticker for 21EMA structure
 * 3. Applies pullback filters to find 5-10 candidates
 *
 * Run with: npx tsx src/lib/market-data/__tests__/test-task3.ts
 *
 * Prerequisites:
 * - Dev server must be running (npm run dev)
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

interface PullbackTickerData {
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
}

interface PullbackCandidate {
  rank: number;
  ticker: string;
  rs: number;
  theme: string;
  price: number;
  adr_pct: number;
  dist_21_atr: number;
  dist_50_atr: number;
  close_pct: number;
  contraction: boolean;
  weekly_return_pct: number;
  earnings_days: number;
  ready_grade: 'A' | 'B' | 'C';
}

interface PullbackScanOutput {
  task: string;
  refresh: string;
  count: number;
  tickers: string[];
  candidates: PullbackCandidate[];
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

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

// =============================================================================
// Analysis Functions (inline for test)
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

  // Weekly return
  let weekly_return_pct = 0;
  if (bars.length >= 6) {
    const weekAgoClose = bars[bars.length - 6].close;
    weekly_return_pct = weekAgoClose > 0 ? ((close - weekAgoClose) / weekAgoClose) * 100 : 0;
  }

  // Close range %
  const range = latestBar.high - latestBar.low;
  const close_range_pct = range > 0 ? ((close - latestBar.low) / range) * 100 : 50;

  // Contraction
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

// =============================================================================
// Pullback Scan Logic
// =============================================================================

interface PullbackCriteria {
  min_dist_21_atr: number;
  max_dist_21_atr: number;
  min_dist_50_atr: number;
  max_dist_50_atr: number;
  min_close_range_pct: number;
  max_weekly_return_pct: number;
  require_structure_intact: boolean;
}

const DEFAULT_CRITERIA: PullbackCriteria = {
  min_dist_21_atr: -0.5,
  max_dist_21_atr: 1.0,
  min_dist_50_atr: 0,
  max_dist_50_atr: 3.0,
  min_close_range_pct: 20,
  max_weekly_return_pct: 12,
  require_structure_intact: true,
};

function calculateGrade(
  dist21: number,
  closeRangePct: number,
  isContracting: boolean,
  weeklyReturn: number
): 'A' | 'B' | 'C' {
  let score = 0;

  // Distance to 21EMA (closer = better)
  if (Math.abs(dist21) <= 0.3) score += 3;
  else if (Math.abs(dist21) <= 0.5) score += 2;
  else if (Math.abs(dist21) <= 0.8) score += 1;

  // Close in upper range
  if (closeRangePct >= 60) score += 2;
  else if (closeRangePct >= 40) score += 1;

  // Contraction
  if (isContracting) score += 2;

  // Not extended (low weekly return)
  if (weeklyReturn < 5) score += 2;
  else if (weeklyReturn < 8) score += 1;

  if (score >= 7) return 'A';
  if (score >= 4) return 'B';
  return 'C';
}

function applyPullbackFilters(
  data: PullbackTickerData,
  criteria: PullbackCriteria
): { passed: boolean; reason?: string } {
  // Distance to 21EMA
  if (data.dist_21ema_atr < criteria.min_dist_21_atr) {
    return { passed: false, reason: `Dist21 ${data.dist_21ema_atr.toFixed(2)} < ${criteria.min_dist_21_atr}` };
  }
  if (data.dist_21ema_atr > criteria.max_dist_21_atr) {
    return { passed: false, reason: `Dist21 ${data.dist_21ema_atr.toFixed(2)} > ${criteria.max_dist_21_atr}` };
  }

  // Distance to 50EMA
  if (data.dist_50ema_atr < criteria.min_dist_50_atr) {
    return { passed: false, reason: `Dist50 ${data.dist_50ema_atr.toFixed(2)} < ${criteria.min_dist_50_atr}` };
  }
  if (data.dist_50ema_atr > criteria.max_dist_50_atr) {
    return { passed: false, reason: `Dist50 ${data.dist_50ema_atr.toFixed(2)} > ${criteria.max_dist_50_atr}` };
  }

  // Weekly return
  if (data.weekly_return_pct > criteria.max_weekly_return_pct) {
    return { passed: false, reason: `Weekly ${data.weekly_return_pct.toFixed(1)}% > ${criteria.max_weekly_return_pct}%` };
  }

  // Structure intact (close >= MALow)
  if (criteria.require_structure_intact && data.close < data.ema21_low) {
    return { passed: false, reason: 'Structure broken (close < MALow)' };
  }

  return { passed: true };
}

// =============================================================================
// Main Test
// =============================================================================

async function runTest() {
  console.log('='.repeat(70));
  console.log('Task 3 Pullback Scan Test - Real Yahoo Finance Data');
  console.log('='.repeat(70));
  console.log();

  // =========================================================================
  // Step 1: Run Task 2 to get liquid leaders universe
  // =========================================================================
  console.log('Step 1: Running Task 2 (Universe Scan) to get liquid leaders...');
  console.log();

  const rsStartTime = Date.now();
  const rsData = await fetchRSData(NASDAQ_100_TICKERS);
  const rsTime = ((Date.now() - rsStartTime) / 1000).toFixed(1);
  console.log(`RS calculation complete in ${rsTime}s (${rsData.size} tickers)`);

  // Quick universe filter (RS >= 70, not China ADR, not defensive)
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
  // Step 2: Analyze structure for each leader
  // =========================================================================
  console.log('Step 2: Analyzing 21EMA structure for each leader...');
  console.log('(Fetching 60 days of OHLC data per ticker)');
  console.log();

  const BATCH_SIZE = 5;
  const structureData: Map<string, TickerStructureAnalysis> = new Map();
  const universeData: Map<string, UniverseTickerData> = new Map();

  const analysisStartTime = Date.now();

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
    process.stdout.write(`\rAnalyzing: ${progress}/${liquidLeaders.length}`);

    if (i + BATCH_SIZE < liquidLeaders.length) {
      await delay(1000);
    }
  }
  console.log();

  const analysisTime = ((Date.now() - analysisStartTime) / 1000).toFixed(1);
  console.log(`Structure analysis complete in ${analysisTime}s`);
  console.log(`Tickers analyzed: ${structureData.size}/${liquidLeaders.length}`);
  console.log();

  // =========================================================================
  // Step 3: Show structure summary
  // =========================================================================
  console.log('Structure Summary:');
  console.log('-'.repeat(90));
  console.log(
    'Ticker'.padEnd(8) +
    'Close'.padEnd(10) +
    'MA21L'.padEnd(10) +
    'MA21C'.padEnd(10) +
    'MA21H'.padEnd(10) +
    'ATR'.padEnd(8) +
    'Dist21'.padEnd(8) +
    'Position'
  );
  console.log('-'.repeat(90));

  const structureList = [...structureData.values()]
    .sort((a, b) => a.dist_21ema_atr - b.dist_21ema_atr);

  for (const s of structureList.slice(0, 10)) {
    console.log(
      s.ticker.padEnd(8) +
      ('$' + s.close.toFixed(2)).padEnd(10) +
      ('$' + s.ema21_low.toFixed(2)).padEnd(10) +
      ('$' + s.ema21_close.toFixed(2)).padEnd(10) +
      ('$' + s.ema21_high.toFixed(2)).padEnd(10) +
      ('$' + s.atr14.toFixed(2)).padEnd(8) +
      ((s.dist_21ema_atr >= 0 ? '+' : '') + s.dist_21ema_atr.toFixed(2)).padEnd(8) +
      s.structure_position
    );
  }
  console.log();

  // =========================================================================
  // Step 4: Apply pullback filters
  // =========================================================================
  console.log('Step 3: Applying pullback filters...');
  console.log('-'.repeat(50));
  console.log(`Filters: Dist21 [${DEFAULT_CRITERIA.min_dist_21_atr}, ${DEFAULT_CRITERIA.max_dist_21_atr}] ATR`);
  console.log(`         Weekly return < ${DEFAULT_CRITERIA.max_weekly_return_pct}%`);
  console.log(`         Structure intact (close >= MALow)`);
  console.log();

  const pullbackData: PullbackTickerData[] = [];

  for (const [ticker, structure] of structureData) {
    const rs = rsData.get(ticker);
    const universe = universeData.get(ticker);
    if (!rs || !universe) continue;

    pullbackData.push({
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
      earnings_days: 30, // Placeholder
      ema21_high: structure.ema21_high,
      ema21_close: structure.ema21_close,
      ema21_low: structure.ema21_low,
      close: structure.close,
      atr: structure.atr14,
      liquidity_m: universe.liquidityM,
      rank: 0,
    });
  }

  const filterStats = {
    total: pullbackData.length,
    dist21: 0,
    dist50: 0,
    weekly: 0,
    structure: 0,
    passed: 0,
  };

  const passedCandidates: Array<{ data: PullbackTickerData; grade: 'A' | 'B' | 'C' }> = [];

  for (const data of pullbackData) {
    const result = applyPullbackFilters(data, DEFAULT_CRITERIA);

    if (!result.passed) {
      if (result.reason?.includes('Dist21')) filterStats.dist21++;
      else if (result.reason?.includes('Dist50')) filterStats.dist50++;
      else if (result.reason?.includes('Weekly')) filterStats.weekly++;
      else if (result.reason?.includes('Structure')) filterStats.structure++;
    } else {
      filterStats.passed++;
      const grade = calculateGrade(
        data.dist_21ema_atr,
        data.close_range_pct,
        data.is_contracting,
        data.weekly_return_pct
      );
      passedCandidates.push({ data, grade });
    }
  }

  console.log('Filter Results:');
  console.log(`  Total analyzed:        ${filterStats.total}`);
  console.log(`  Excluded - Dist21:     ${filterStats.dist21}`);
  console.log(`  Excluded - Dist50:     ${filterStats.dist50}`);
  console.log(`  Excluded - Weekly:     ${filterStats.weekly}`);
  console.log(`  Excluded - Structure:  ${filterStats.structure}`);
  console.log(`  --------------------------------`);
  console.log(`  Passed all filters:    ${filterStats.passed}`);
  console.log();

  // =========================================================================
  // Step 5: Sort and build output
  // =========================================================================
  const gradeOrder = { A: 0, B: 1, C: 2 };
  const sortedCandidates = passedCandidates
    .sort((a, b) => {
      const gradeCompare = gradeOrder[a.grade] - gradeOrder[b.grade];
      if (gradeCompare !== 0) return gradeCompare;
      return b.data.rs - a.data.rs;
    })
    .slice(0, 10);

  const output: PullbackScanOutput = {
    task: 'pullback_scan',
    refresh: 'EOD',
    count: sortedCandidates.length,
    tickers: sortedCandidates.map(c => c.data.ticker),
    candidates: sortedCandidates.map((c, i) => ({
      rank: i + 1,
      ticker: c.data.ticker,
      rs: c.data.rs,
      theme: c.data.theme,
      price: c.data.price,
      adr_pct: c.data.adr_pct,
      dist_21_atr: c.data.dist_21ema_atr,
      dist_50_atr: c.data.dist_50ema_atr,
      close_pct: c.data.close_range_pct,
      contraction: c.data.is_contracting,
      weekly_return_pct: c.data.weekly_return_pct,
      earnings_days: c.data.earnings_days,
      ready_grade: c.grade,
    })),
  };

  // =========================================================================
  // Step 6: Print results
  // =========================================================================
  console.log('='.repeat(70));
  console.log('PULLBACK CANDIDATES OUTPUT');
  console.log('='.repeat(70));
  console.log();
  console.log(`Final count: ${output.count} (target: 5-10)`);
  console.log();

  if (output.candidates.length > 0) {
    console.log('Pullback Candidates (sorted by grade, then RS):');
    console.log('-'.repeat(100));
    console.log(
      'Rank'.padEnd(6) +
      'Ticker'.padEnd(8) +
      'Grade'.padEnd(7) +
      'RS'.padEnd(5) +
      'Price'.padEnd(10) +
      'Dist21'.padEnd(8) +
      'WkRet%'.padEnd(8) +
      'Close%'.padEnd(8) +
      'Contr'.padEnd(7) +
      'Theme'
    );
    console.log('-'.repeat(100));

    for (const c of output.candidates) {
      console.log(
        String(c.rank).padEnd(6) +
        c.ticker.padEnd(8) +
        c.ready_grade.padEnd(7) +
        String(c.rs).padEnd(5) +
        ('$' + c.price.toFixed(2)).padEnd(10) +
        ((c.dist_21_atr >= 0 ? '+' : '') + c.dist_21_atr.toFixed(2)).padEnd(8) +
        ((c.weekly_return_pct >= 0 ? '+' : '') + c.weekly_return_pct.toFixed(1) + '%').padEnd(8) +
        (c.close_pct.toFixed(0) + '%').padEnd(8) +
        (c.contraction ? 'YES' : 'NO').padEnd(7) +
        c.theme
      );
    }
  } else {
    console.log('No pullback candidates found matching criteria.');
    console.log('This is normal in strong trending markets with few pullbacks.');
  }

  console.log();
  console.log('Ticker list:', output.tickers.join(', ') || '(none)');
  console.log();

  // =========================================================================
  // Validation
  // =========================================================================
  console.log('='.repeat(70));
  console.log('VALIDATION');
  console.log('='.repeat(70));

  const validations = [
    { name: 'Has candidates array', pass: Array.isArray(output.candidates) },
    { name: 'Count matches candidates length', pass: output.count === output.candidates.length },
    { name: 'Candidates have required fields', pass: output.candidates.every(c =>
      c.ticker && typeof c.rs === 'number' && typeof c.dist_21_atr === 'number'
    )},
    { name: 'All grades are A/B/C', pass: output.candidates.every(c =>
      ['A', 'B', 'C'].includes(c.ready_grade)
    )},
    { name: 'Sorted by grade (A first)', pass: output.candidates.every((c, i, arr) =>
      i === 0 || gradeOrder[arr[i - 1].ready_grade] <= gradeOrder[c.ready_grade]
    )},
    { name: 'All dist_21 in range [-0.5, 1.0]', pass: output.candidates.every(c =>
      c.dist_21_atr >= -0.5 && c.dist_21_atr <= 1.0
    )},
  ];

  for (const v of validations) {
    console.log(`${v.pass ? '✓' : '✗'} ${v.name}`);
  }

  const allPassed = validations.every(v => v.pass);
  console.log();
  console.log(allPassed ? '✓ ALL VALIDATIONS PASSED' : '✗ SOME VALIDATIONS FAILED');
  console.log();

  const totalTime = parseFloat(rsTime) + parseFloat(analysisTime);
  console.log(`Total execution time: ${totalTime.toFixed(1)}s`);

  return output;
}

// Run the test
runTest().catch(console.error);
