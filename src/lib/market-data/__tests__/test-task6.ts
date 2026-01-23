/**
 * Test Script for Task 6 (Position Sizing & Risk Gate) with Real Data
 *
 * This script tests the full pipeline:
 * 1. Runs Task 1 to get market state (simulated)
 * 2. Runs Task 2 to get liquid leaders universe
 * 3. Runs Task 3 to get pullback candidates
 * 4. Runs Task 4 to get READY candidates
 * 5. Runs Task 5 to score and rank into Top 5
 * 6. Runs Task 6 to calculate position sizing with risk gate
 *
 * Run with: npx tsx src/lib/market-data/__tests__/test-task6.ts
 *
 * Prerequisites:
 * - Dev server must be running (npm run dev)
 *
 * @see docs/TESTS.md for test patterns
 * @see docs/BUGS.md for known issues
 */

import Decimal from 'decimal.js';

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

interface ReadinessRow {
  ticker: string;
  ready: boolean;
  mode: 'MODE1' | 'MODE2';
  dist_to_21ema_atr: number;
  earnings_days: number;
  setup?: string;
  entry_trigger?: string;
}

interface ScoringResult {
  ticker: string;
  rank: number;
  total_score: number;
  grade_score: number;
  dist_score: number;
  mode_score: number;
  contraction_score: number;
  close_range_score: number;
  rs_score: number;
  ready_grade: 'A' | 'B' | 'C';
  dist_21_atr: number;
  mode: 'MODE1' | 'MODE2';
  contraction: boolean;
  close_range_pct: number;
  rs: number;
  theme: string;
}

type NewEntriesPermission = 'YES' | 'LIMITED' | 'NO';

interface MarketPermissions {
  new_entries: NewEntriesPermission;
  adds: boolean;
  pressing: boolean;
  trims: boolean;
}

interface MarketContext {
  permissions: MarketPermissions;
}

interface PortfolioContext {
  equity: Decimal | number | string;
  current_exposure_pct?: number;
  current_ner_pct?: number;
}

interface SizingConfig {
  mode1_position_pct?: [number, number];
  mode2_position_pct?: [number, number];
  mode1_max_ner_pct?: number;
  mode2_max_ner_pct?: number;
  min_earnings_days?: number;
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'http://localhost:3000';

/** Configurable equity for testing */
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

// Pullback filter criteria
const PULLBACK_CRITERIA = {
  min_dist_21_atr: -0.5,
  max_dist_21_atr: 1.0,
  min_dist_50_atr: 0,
  max_dist_50_atr: 3.0,
  max_weekly_return_pct: 12,
};

// Scoring weights (sum = 100)
const SCORING_WEIGHTS = {
  ready_grade: 30,
  dist_21_atr: 25,
  entry_mode: 15,
  contraction: 10,
  close_range: 10,
  rs: 10,
};

// Sizing configuration
const SIZING_CONFIG: Required<SizingConfig> = {
  mode1_position_pct: [10, 12],
  mode2_position_pct: [12, 15],
  mode1_max_ner_pct: 0.25,
  mode2_max_ner_pct: 0.50,
  min_earnings_days: 7,
};

// =============================================================================
// Decimal Helpers
// =============================================================================

function toDecimal(value: Decimal | number | string): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

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

function calculateGrade(dist21: number, closeRangePct: number, isContracting: boolean, weeklyReturn: number): 'A' | 'B' | 'C' {
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
// Task 1 Logic (Market State - Simulated)
// =============================================================================

/**
 * Derive market permissions from market state
 * Per agent_skeleton_v1.0.md Section 1
 */
function deriveMarketPermissions(
  state: string,
  structurePosition: string,
  structureSlope: string
): MarketPermissions {
  const permissionMap: Record<string, MarketPermissions> = {
    'CONFIRMED_UPTREND': {
      new_entries: 'YES',
      adds: true,
      pressing: true,
      trims: true,
    },
    'EARLY_CONFIRMATION': {
      new_entries: 'LIMITED',
      adds: true,
      pressing: false,
      trims: true,
    },
    'PARTICIPATION_FADE': {
      new_entries: 'LIMITED',
      adds: false,
      pressing: false,
      trims: true,
    },
    'BREAKDOWN': {
      new_entries: 'NO',
      adds: false,
      pressing: false,
      trims: true,
    },
    'WASHOUT': {
      new_entries: 'NO',
      adds: false,
      pressing: false,
      trims: false,
    },
  };

  let permissions = permissionMap[state] ?? {
    new_entries: 'NO' as NewEntriesPermission,
    adds: false,
    pressing: false,
    trims: true,
  };

  // Additional checks based on structure
  if (structurePosition === 'below_cloud' || structureSlope === 'falling') {
    permissions = {
      ...permissions,
      new_entries: 'NO',
      pressing: false,
    };
  }

  return permissions;
}

// =============================================================================
// Task 4 Logic (Readiness)
// =============================================================================

function determineBarColor(close: number, ema21High: number, ema21Close: number, ema21Low: number): string {
  if (close > ema21High && close > ema21Close && close > ema21Low) return 'bullish';
  if (close < ema21High && close < ema21Close && close < ema21Low) return 'bearish';
  return 'neutral';
}

function determineStructurePosition(close: number, ema21High: number, ema21Low: number): string {
  if (close > ema21High) return 'above';
  if (close < ema21Low) return 'below';
  return 'inside';
}

function determineEntryMode(structurePosition: string, barColor: string): { mode: 'MODE1' | 'MODE2'; setup: string; trigger: string } {
  if (structurePosition === 'above' && barColor === 'bullish') {
    return {
      mode: 'MODE2',
      setup: '2) Reclaim & Backtest -> Higher Low',
      trigger: 'Strength reclaim (R2G / 21 high reclaim)',
    };
  }
  return {
    mode: 'MODE1',
    setup: '1) Uptrend Pullback -> Rising 21EMA',
    trigger: 'Weakness into 21 structure (retest)',
  };
}

function evaluateReadiness(data: EnrichedPullbackData): ReadinessRow & { bar_color: string; structure_position: string } {
  const barColor = determineBarColor(data.close, data.ema21_high, data.ema21_close, data.ema21_low);
  const structurePosition = determineStructurePosition(data.close, data.ema21_high, data.ema21_low);
  const { mode, setup, trigger } = determineEntryMode(structurePosition, barColor);

  const atrCheck = data.dist_21ema_atr >= PULLBACK_CRITERIA.min_dist_21_atr &&
                   data.dist_21ema_atr <= PULLBACK_CRITERIA.max_dist_21_atr;
  const structureCheck = data.close >= data.ema21_low;
  const earningsCheck = data.earnings_days >= 7 || data.earnings_days < 0;

  return {
    ticker: data.ticker,
    ready: atrCheck && structureCheck && earningsCheck,
    mode,
    dist_to_21ema_atr: data.dist_21ema_atr,
    earnings_days: data.earnings_days,
    setup,
    entry_trigger: trigger,
    bar_color: barColor,
    structure_position: structurePosition,
  };
}

// =============================================================================
// Task 5 Logic (Scoring)
// =============================================================================

function scoreGrade(grade: 'A' | 'B' | 'C'): number {
  switch (grade) {
    case 'A': return SCORING_WEIGHTS.ready_grade;
    case 'B': return Math.round(SCORING_WEIGHTS.ready_grade * 2 / 3);
    case 'C': return Math.round(SCORING_WEIGHTS.ready_grade / 3);
    default: return 0;
  }
}

function scoreDist21(dist: number): number {
  const d = Math.abs(dist);
  if (d <= 0.1) return SCORING_WEIGHTS.dist_21_atr;
  if (d <= 0.5) return Math.round(SCORING_WEIGHTS.dist_21_atr * 0.6);
  if (d <= 1.0) return Math.round(SCORING_WEIGHTS.dist_21_atr * 0.2);
  return 0;
}

function scoreMode(mode: string): number {
  if (mode === 'MODE2') return SCORING_WEIGHTS.entry_mode;
  return Math.round(SCORING_WEIGHTS.entry_mode * 2 / 3);
}

function scoreContraction(hasContraction: boolean): number {
  return hasContraction ? SCORING_WEIGHTS.contraction : 0;
}

function scoreCloseRange(closeRangePct: number): number {
  return Math.round((closeRangePct / 100) * SCORING_WEIGHTS.close_range);
}

function scoreRS(rs: number): number {
  if (rs >= 90) return SCORING_WEIGHTS.rs;
  if (rs >= 80) return Math.round(SCORING_WEIGHTS.rs * 0.7);
  if (rs >= 70) return Math.round(SCORING_WEIGHTS.rs * 0.4);
  return Math.round(SCORING_WEIGHTS.rs * 0.1);
}

interface ScoringInput {
  ticker: string;
  ready_grade: 'A' | 'B' | 'C';
  dist_21_atr: number;
  mode: 'MODE1' | 'MODE2';
  contraction: boolean;
  close_range_pct: number;
  rs: number;
  theme: string;
}

function scoreCandidates(inputs: ScoringInput[]): ScoringResult[] {
  const scored = inputs.map(input => {
    const grade_score = scoreGrade(input.ready_grade);
    const dist_score = scoreDist21(input.dist_21_atr);
    const mode_score = scoreMode(input.mode);
    const contraction_score = scoreContraction(input.contraction);
    const close_range_score = scoreCloseRange(input.close_range_pct);
    const rs_score = scoreRS(input.rs);
    const total_score = grade_score + dist_score + mode_score + contraction_score + close_range_score + rs_score;

    return {
      ticker: input.ticker,
      rank: 0,
      total_score,
      grade_score,
      dist_score,
      mode_score,
      contraction_score,
      close_range_score,
      rs_score,
      ready_grade: input.ready_grade,
      dist_21_atr: input.dist_21_atr,
      mode: input.mode,
      contraction: input.contraction,
      close_range_pct: input.close_range_pct,
      rs: input.rs,
      theme: input.theme,
    };
  });

  scored.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    return b.rs - a.rs;
  });

  scored.forEach((s, i) => s.rank = i + 1);
  return scored;
}

// =============================================================================
// Task 6 Logic (Position Sizing)
// =============================================================================

interface SizingData {
  ticker: string;
  mode: 'MODE1' | 'MODE2';
  price: number;
  ema21_low: number;
  atr: number;
  earnings_days: number;
  rank: number;
  theme: string;
}

interface SizingResult {
  ticker: string;
  mode: 'MODE1' | 'MODE2';
  entry_price: Decimal;
  ssl_price: Decimal;
  position_pct: Decimal;
  position_dollars: Decimal;
  shares: number;
  r_per_share: Decimal;
  total_r_dollars: Decimal;
  ec_risk_pct: Decimal;
  ner_pct: Decimal;
  max_ner_pct: Decimal;
  trim_2r_price: Decimal;
  gate: 'PASS' | 'WITHHOLD';
  withhold_reason?: string;
}

function getPositionPercent(
  mode: 'MODE1' | 'MODE2',
  config: Required<SizingConfig>,
  isLimited: boolean
): Decimal {
  const range = mode === 'MODE1'
    ? config.mode1_position_pct
    : config.mode2_position_pct;

  // Use middle of range normally
  let pct = toDecimal(range[0] + range[1]).div(2);

  // Reduce for LIMITED entries (50% reduction)
  if (isLimited) {
    pct = pct.times(0.5);
  }

  return pct;
}

function getMaxNer(mode: 'MODE1' | 'MODE2', config: Required<SizingConfig>): Decimal {
  return mode === 'MODE1'
    ? toDecimal(config.mode1_max_ner_pct)
    : toDecimal(config.mode2_max_ner_pct);
}

function calculatePositionSizing(
  candidate: SizingData,
  portfolio: PortfolioContext,
  market: MarketContext,
  config: Required<SizingConfig>
): SizingResult {
  const equity = toDecimal(portfolio.equity);
  const entry = toDecimal(candidate.price);
  const ssl = toDecimal(candidate.ema21_low);
  const isLimited = market.permissions.new_entries === 'LIMITED';

  // Position size percentage
  const positionPct = getPositionPercent(candidate.mode, config, isLimited);

  // Position in dollars
  const positionDollars = equity.times(positionPct).div(100);

  // Number of shares (floor to whole shares)
  const shares = positionDollars.div(entry).floor().toNumber();

  // R per share (risk per share = entry - stop)
  const rPerShare = entry.minus(ssl);

  // Total R in dollars
  const totalRDollars = rPerShare.times(shares);

  // EC risk percent (risk as % of equity)
  const ecRiskPct = totalRDollars.div(equity).times(100);

  // NER percent (same as EC risk for new positions)
  const nerPct = ecRiskPct;

  // Max NER for this mode
  const maxNerPct = getMaxNer(candidate.mode, config);

  // 2R trim price (entry + 2 * R)
  const trim2rPrice = entry.plus(rPerShare.times(2));

  // Evaluate gate
  let gate: 'PASS' | 'WITHHOLD' = 'PASS';
  let withholdReason: string | undefined;

  // Gate 1: Market regime forbids new entries
  if (market.permissions.new_entries === 'NO') {
    gate = 'WITHHOLD';
    withholdReason = 'Market regime forbids new entries';
  }
  // Gate 2: Earnings < 7 days
  else if (candidate.earnings_days >= 0 && candidate.earnings_days < config.min_earnings_days) {
    gate = 'WITHHOLD';
    withholdReason = `Earnings in ${candidate.earnings_days} days < ${config.min_earnings_days} day minimum`;
  }
  // Gate 3: NER exceeds allowed
  else if (nerPct.gt(maxNerPct)) {
    gate = 'WITHHOLD';
    withholdReason = `NER ${nerPct.toFixed(2)}% exceeds ${candidate.mode} limit of ${maxNerPct.toFixed(2)}%`;
  }

  return {
    ticker: candidate.ticker,
    mode: candidate.mode,
    entry_price: entry,
    ssl_price: ssl,
    position_pct: positionPct,
    position_dollars: positionDollars,
    shares,
    r_per_share: rPerShare,
    total_r_dollars: totalRDollars,
    ec_risk_pct: ecRiskPct,
    ner_pct: nerPct,
    max_ner_pct: maxNerPct,
    trim_2r_price: trim2rPrice,
    gate,
    withhold_reason: withholdReason,
  };
}

// =============================================================================
// Main Test
// =============================================================================

async function runTest() {
  console.log('='.repeat(80));
  console.log('Task 6 Position Sizing & Risk Gate Test - Real Yahoo Finance Data');
  console.log('='.repeat(80));
  console.log();

  const totalStartTime = Date.now();

  // =========================================================================
  // Step 1: Simulate Task 1 (Market State)
  // =========================================================================
  console.log('Step 1: Running Task 1 (Market State - Simulated)...');

  // Simulate CONFIRMED_UPTREND for testing
  const marketState = {
    state: 'CONFIRMED_UPTREND',
    structure_position: 'above_cloud',
    structure_slope: 'rising',
  };

  const marketPermissions = deriveMarketPermissions(
    marketState.state,
    marketState.structure_position,
    marketState.structure_slope
  );

  const marketContext: MarketContext = { permissions: marketPermissions };

  console.log(`Market State: ${marketState.state}`);
  console.log(`New Entries: ${marketPermissions.new_entries}`);
  console.log(`Adds: ${marketPermissions.adds}, Pressing: ${marketPermissions.pressing}`);
  console.log();

  // =========================================================================
  // Step 2: Run Task 2 (Universe Scan)
  // =========================================================================
  console.log('Step 2: Running Task 2 (Universe Scan)...');

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
  console.log(`Liquid leaders: ${liquidLeaders.length} tickers`);
  console.log();

  // =========================================================================
  // Step 3: Run Task 3 (Pullback Scan)
  // =========================================================================
  console.log('Step 3: Running Task 3 (Pullback Scan)...');

  const structureData: Map<string, TickerStructureAnalysis> = new Map();
  const universeData: Map<string, UniverseTickerData> = new Map();
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

    process.stdout.write(`\rAnalyzing: ${Math.min(i + BATCH_SIZE, liquidLeaders.length)}/${liquidLeaders.length}`);
    if (i + BATCH_SIZE < liquidLeaders.length) await delay(1000);
  }
  console.log();

  // Apply pullback filters
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
      earnings_days: 30,
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

  console.log(`Task 3 output: ${pullbackCandidates.length} pullback candidates`);
  console.log();

  if (pullbackCandidates.length === 0) {
    console.log('No pullback candidates found. Cannot proceed.');
    return;
  }

  // =========================================================================
  // Step 4: Fetch Earnings & Run Task 4 (Readiness)
  // =========================================================================
  console.log('Step 4: Running Task 4 (Entry Readiness)...');

  const earningsData = await fetchEarningsData(pullbackCandidates.map(c => c.ticker));
  for (const candidate of pullbackCandidates) {
    const earnings = earningsData.get(candidate.ticker);
    if (earnings) candidate.earnings_days = earnings.daysUntilEarnings;
  }

  const readinessResults = pullbackCandidates.map(c => ({
    ...evaluateReadiness(c),
    pullback: c,
  }));

  const readyCandidates = readinessResults.filter(r => r.ready);
  console.log(`Task 4 output: ${readyCandidates.length} READY candidates`);
  console.log('Ready tickers:', readyCandidates.map(r => r.ticker).join(', ') || '(none)');
  console.log();

  if (readyCandidates.length === 0) {
    console.log('No READY candidates. Cannot proceed to Task 5.');
    return;
  }

  // =========================================================================
  // Step 5: Run Task 5 (Focus List Ranking)
  // =========================================================================
  console.log('Step 5: Running Task 5 (Focus List Ranking)...');

  const scoringInputs: ScoringInput[] = readyCandidates.map(r => ({
    ticker: r.ticker,
    ready_grade: r.pullback.ready_grade,
    dist_21_atr: r.dist_to_21ema_atr,
    mode: r.mode,
    contraction: r.pullback.is_contracting,
    close_range_pct: r.pullback.close_range_pct,
    rs: r.pullback.rs,
    theme: r.pullback.theme,
  }));

  const scoredCandidates = scoreCandidates(scoringInputs);
  const top5 = scoredCandidates.slice(0, 5);

  console.log(`Task 5 output: Top ${top5.length} candidates`);
  console.log('Top 5:', top5.map(s => `${s.ticker}(${s.total_score}pts)`).join(', '));
  console.log();

  // =========================================================================
  // Step 6: Run Task 6 (Position Sizing & Risk Gate)
  // =========================================================================
  console.log('Step 6: Running Task 6 (Position Sizing & Risk Gate)...');
  console.log();

  const portfolio: PortfolioContext = {
    equity: TEST_EQUITY,
  };

  // Build sizing data for top 5
  const sizingData: SizingData[] = top5.map(s => {
    const pullback = pullbackCandidates.find(p => p.ticker === s.ticker)!;
    return {
      ticker: s.ticker,
      mode: s.mode,
      price: pullback.price,
      ema21_low: pullback.ema21_low,
      atr: pullback.atr,
      earnings_days: pullback.earnings_days,
      rank: s.rank,
      theme: s.theme,
    };
  });

  const sizingResults = sizingData.map(data =>
    calculatePositionSizing(data, portfolio, marketContext, SIZING_CONFIG)
  );

  // =========================================================================
  // Print Results
  // =========================================================================
  console.log('='.repeat(80));
  console.log('POSITION SIZING OUTPUT');
  console.log('='.repeat(80));
  console.log();

  console.log(`Portfolio Equity: $${TEST_EQUITY.toLocaleString()}`);
  console.log(`Market State: ${marketState.state} (new_entries=${marketPermissions.new_entries})`);
  console.log();

  console.log('Position Sizing Parameters:');
  console.log(`  MODE1: ${SIZING_CONFIG.mode1_position_pct[0]}-${SIZING_CONFIG.mode1_position_pct[1]}% position, max NER ${SIZING_CONFIG.mode1_max_ner_pct}%`);
  console.log(`  MODE2: ${SIZING_CONFIG.mode2_position_pct[0]}-${SIZING_CONFIG.mode2_position_pct[1]}% position, max NER ${SIZING_CONFIG.mode2_max_ner_pct}%`);
  console.log(`  Min Earnings Days: ${SIZING_CONFIG.min_earnings_days}`);
  console.log();

  console.log('-'.repeat(80));
  console.log(
    'Ticker'.padEnd(8) +
    'Mode'.padEnd(7) +
    'Entry'.padStart(9) +
    'SSL'.padStart(9) +
    'Pos%'.padStart(7) +
    'Pos$'.padStart(10) +
    'Shares'.padStart(8) +
    'R/shr'.padStart(7) +
    '2R Trim'.padStart(9) +
    'EC%'.padStart(7) +
    'Gate'.padStart(10)
  );
  console.log('-'.repeat(80));

  for (const r of sizingResults) {
    const gateStr = r.gate === 'PASS' ? 'PASS' : 'WITHHOLD';
    console.log(
      r.ticker.padEnd(8) +
      r.mode.padEnd(7) +
      ('$' + r.entry_price.toFixed(2)).padStart(9) +
      ('$' + r.ssl_price.toFixed(2)).padStart(9) +
      (r.position_pct.toFixed(1) + '%').padStart(7) +
      ('$' + r.position_dollars.toFixed(0)).padStart(10) +
      String(r.shares).padStart(8) +
      ('$' + r.r_per_share.toFixed(2)).padStart(7) +
      ('$' + r.trim_2r_price.toFixed(2)).padStart(9) +
      (r.ec_risk_pct.toFixed(2) + '%').padStart(7) +
      gateStr.padStart(10)
    );
  }
  console.log('-'.repeat(80));
  console.log();

  // Print detailed results
  console.log('='.repeat(80));
  console.log('DETAILED BREAKDOWN');
  console.log('='.repeat(80));
  console.log();

  for (const r of sizingResults) {
    const pullback = pullbackCandidates.find(p => p.ticker === r.ticker)!;
    console.log(`${r.ticker} (${r.mode})`);
    console.log('-'.repeat(50));
    console.log(`  Entry Price:      $${r.entry_price.toFixed(2)}`);
    console.log(`  SSL (21EMA Low):  $${r.ssl_price.toFixed(2)}`);
    console.log(`  ATR:              $${pullback.atr.toFixed(2)}`);
    console.log(`  Position %:       ${r.position_pct.toFixed(1)}%`);
    console.log(`  Position $:       $${r.position_dollars.toFixed(2)}`);
    console.log(`  Shares:           ${r.shares}`);
    console.log(`  R per Share:      $${r.r_per_share.toFixed(2)}`);
    console.log(`  Total R ($):      $${r.total_r_dollars.toFixed(2)}`);
    console.log(`  EC Risk %:        ${r.ec_risk_pct.toFixed(2)}%`);
    console.log(`  NER %:            ${r.ner_pct.toFixed(2)}% (max: ${r.max_ner_pct.toFixed(2)}%)`);
    console.log(`  2R Trim Price:    $${r.trim_2r_price.toFixed(2)}`);
    console.log(`  Earnings Days:    ${pullback.earnings_days}`);
    console.log(`  Gate:             ${r.gate}${r.withhold_reason ? ` (${r.withhold_reason})` : ''}`);
    console.log();
  }

  // =========================================================================
  // Summary
  // =========================================================================
  const passedResults = sizingResults.filter(r => r.gate === 'PASS');
  const withheldResults = sizingResults.filter(r => r.gate === 'WITHHOLD');

  const totalPositionDollars = passedResults.reduce(
    (sum, r) => sum.plus(r.position_dollars),
    new Decimal(0)
  );
  const totalNerPct = passedResults.reduce(
    (sum, r) => sum.plus(r.ner_pct),
    new Decimal(0)
  );

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log();

  console.log(`Total Candidates:    ${sizingResults.length}`);
  console.log(`Passed:              ${passedResults.length}`);
  console.log(`Withheld:            ${withheldResults.length}`);
  console.log();
  console.log(`Total Position $:    $${totalPositionDollars.toFixed(2)} (${totalPositionDollars.div(TEST_EQUITY).times(100).toFixed(1)}% of equity)`);
  console.log(`Total NER %:         ${totalNerPct.toFixed(2)}%`);
  console.log();

  if (withheldResults.length > 0) {
    console.log('Withheld Reasons:');
    for (const r of withheldResults) {
      console.log(`  ${r.ticker}: ${r.withhold_reason}`);
    }
    console.log();
  }

  // =========================================================================
  // Validation
  // =========================================================================
  console.log('='.repeat(80));
  console.log('VALIDATION');
  console.log('='.repeat(80));

  const validations = [
    { name: 'All calculations use Decimal.js', pass: sizingResults.every(r =>
      r.entry_price instanceof Decimal &&
      r.ssl_price instanceof Decimal &&
      r.position_dollars instanceof Decimal
    )},
    { name: 'SSL < Entry for all candidates', pass: sizingResults.every(r =>
      r.ssl_price.lt(r.entry_price)
    )},
    { name: 'R per share = Entry - SSL', pass: sizingResults.every(r =>
      r.r_per_share.eq(r.entry_price.minus(r.ssl_price))
    )},
    { name: '2R trim = Entry + 2*R', pass: sizingResults.every(r =>
      r.trim_2r_price.eq(r.entry_price.plus(r.r_per_share.times(2)))
    )},
    { name: 'EC risk = (R * shares) / equity * 100', pass: sizingResults.every(r =>
      r.ec_risk_pct.minus(r.r_per_share.times(r.shares).div(TEST_EQUITY).times(100)).abs().lt(0.01)
    )},
    { name: 'MODE1 position 10-12%', pass: sizingResults.filter(r => r.mode === 'MODE1').every(r =>
      r.position_pct.gte(5) && r.position_pct.lte(12) // 5-12% to account for LIMITED reduction
    )},
    { name: 'MODE2 position 12-15%', pass: sizingResults.filter(r => r.mode === 'MODE2').every(r =>
      r.position_pct.gte(6) && r.position_pct.lte(15) // 6-15% to account for LIMITED reduction
    )},
    { name: 'NER within limits for PASS trades', pass: passedResults.every(r =>
      r.ner_pct.lte(r.max_ner_pct)
    )},
    { name: 'Gate correctly withholds NER violations', pass: sizingResults.every(r =>
      r.ner_pct.lte(r.max_ner_pct) || r.gate === 'WITHHOLD'
    )},
    { name: 'Gate correctly withholds earnings < 7 days', pass: sizingResults.every(r => {
      const pullback = pullbackCandidates.find(p => p.ticker === r.ticker)!;
      return pullback.earnings_days >= 7 || pullback.earnings_days < 0 || r.gate === 'WITHHOLD';
    })},
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
}

// Run the test
runTest().catch(console.error);
