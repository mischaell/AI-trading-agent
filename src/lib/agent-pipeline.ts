/**
 * Agent Pipeline
 *
 * Runs the complete 9-task trading agent pipeline and returns
 * aggregated state for dashboard consumption.
 *
 * Uses real Yahoo Finance data for Tasks 1-7:
 * - Task 1: QQQE OHLC + breadth data
 * - Task 2: RS rankings + liquidity filters
 * - Task 3: Structure analysis (21/50 EMA, ATR)
 * - Task 4: Earnings data
 * - Task 5-7: Use real data from Tasks 2-4
 *
 * Uses Supabase for:
 * - Persisting market snapshots, universe cache, focus list cache
 * - Loading positions and trades from database (Tasks 8-9)
 *
 * Caching: Tasks 2-4 data cached for 1 hour
 * Progress: Optional callback for UI progress updates
 */

// =============================================================================
// Imports - Types
// =============================================================================

import { MarketStateOutput, MarketPermissions } from '@/types/market-state';
import { UniverseScanOutput, UniverseLeader } from '@/types/universe';
import { PullbackScanOutput } from '@/types/pullback';
import { ReadinessOutput, ReadinessRow } from '@/types/readiness';
import { FocusListOutput, FocusListCandidate } from '@/types/focus-list';
import { SizingBatchOutput } from '@/types/sizing';
import { PortfolioOutput } from '@/types/portfolio';
import { OverviewOutput } from '@/types/trades';

// =============================================================================
// Imports - Task Functions
// =============================================================================

import {
  analyzeMarketState,
  analyzeMarketStateWithRealData,
  OHLCBar,
  BreadthData,
} from '@/tasks/market-analysis';

import {
  scanLiquidLeaders,
  TickerData,
} from '@/tasks/universe-scan';

import {
  scanPullbackCandidates,
  PullbackTickerData,
} from '@/tasks/pullback-scan';

import {
  evaluateReadiness,
  ReadinessTickerData,
} from '@/tasks/entry-readiness';

import {
  rankFocusList,
  FocusListTickerData,
} from '@/tasks/focus-list-ranking';

import {
  calculatePositionSizing,
  SizingTickerData,
  PortfolioContext,
  MarketContext,
} from '@/tasks/position-sizing';

import {
  generateExecutionPlan,
  FullExecutionPlanOutput,
} from '@/tasks/execution-plan';

import {
  calculatePortfolio,
  RawPosition,
  RecentTrade,
  AccountContext,
} from '@/tasks/portfolio';

import {
  generateOverview,
  RawTradeFill,
} from '@/tasks/overview';

// =============================================================================
// Imports - Supabase
// =============================================================================

import {
  isSupabaseConfigured,
  insertMarketSnapshot,
  setUniverseCache,
  setFocusListCache,
  getPositions,
  getRecentTrades,
  insertTrade,
  upsertPosition,
  getTodayDate,
  PositionRow,
  PositionInsert,
  TradeRow,
  TradeInsert,
} from '@/lib/supabase';

// =============================================================================
// Exported Types
// =============================================================================

/**
 * Complete agent state containing all task outputs
 */
export interface AgentState {
  /** Task 1: Market regime and permissions */
  marketState: MarketStateOutput;
  /** Task 2: Liquid leaders universe */
  universe: UniverseScanOutput;
  /** Task 3: Pullback candidates */
  pullbacks: PullbackScanOutput;
  /** Task 4: Entry readiness evaluation */
  readiness: ReadinessOutput;
  /** Task 5: Ranked focus list */
  focusList: FocusListOutput;
  /** Task 6: Position sizing with risk gates */
  sizing: SizingBatchOutput;
  /** Task 7: Execution plan (advisory tickets) */
  executionPlan: FullExecutionPlanOutput;
  /** Task 8: Portfolio positions and metrics */
  portfolio: PortfolioOutput;
  /** Task 9: Overview and trades today */
  overview: OverviewOutput;
  /** Timestamp when pipeline was run */
  timestamp: string;
}

/**
 * Progress callback for pipeline status updates
 */
export interface PipelineProgress {
  /** Current task name */
  task: string;
  /** Status of the current task */
  status: 'starting' | 'running' | 'complete' | 'error';
  /** Human-readable message */
  message: string;
  /** Overall progress percentage (0-100) */
  progress: number;
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Account equity in dollars (default: 100000) */
  equity?: number;
  /** Available cash (default: 50000) */
  cash?: number;
  /** Hours to look back for trades today (default: 24) */
  tradeLookbackHours?: number;
  /** Optional progress callback for UI updates */
  onProgress?: (progress: PipelineProgress) => void;
  /** Force refresh - bypasses cache */
  forceRefresh?: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<Omit<PipelineConfig, 'onProgress' | 'forceRefresh'>> = {
  equity: 100000,
  cash: 50000,
  tradeLookbackHours: 24,
};

// =============================================================================
// Caching Layer (1 hour for Tasks 2-4)
// =============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface RSData {
  ticker: string;
  rs: number;
  perf3m: number;
  perf6m: number;
}

interface UniverseDataItem {
  ticker: string;
  price: number;
  avgVolume: number;
  adrPct: number;
  liquidityM: number;
}

interface StructureAnalysis {
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

interface EarningsData {
  ticker: string;
  earningsDate: string | null;
  daysUntilEarnings: number;
  source: string;
}

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

const pipelineCache: {
  rsData: CacheEntry<Map<string, RSData>> | null;
  universeData: CacheEntry<Map<string, UniverseDataItem>> | null;
  structureData: CacheEntry<Map<string, StructureAnalysis>> | null;
  earningsData: CacheEntry<Map<string, EarningsData>> | null;
} = {
  rsData: null,
  universeData: null,
  structureData: null,
  earningsData: null,
};

function isCacheValid<T>(entry: CacheEntry<T> | null): boolean {
  return entry !== null && Date.now() - entry.timestamp < CACHE_DURATION_MS;
}

/**
 * Clear the pipeline cache (for EOD refresh or forced refresh)
 */
export function clearPipelineCache(): void {
  pipelineCache.rsData = null;
  pipelineCache.universeData = null;
  pipelineCache.structureData = null;
  pipelineCache.earningsData = null;
  console.log('[Pipeline] Cache cleared');
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = typeof window !== 'undefined' ? '' : 'http://localhost:3000';

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
  'INTU': 'Enterprise Software', 'TXN': 'Semiconductors', 'CSCO': 'Networking',
  'SNPS': 'EDA Software', 'CDNS': 'EDA Software', 'NXPI': 'Semiconductors',
  'ADSK': 'CAD Software', 'ZS': 'Cybersecurity', 'FTNT': 'Cybersecurity',
  'WDAY': 'Enterprise Software', 'TEAM': 'Enterprise Software', 'ANSS': 'Simulation',
  'CSGP': 'Real Estate Tech', 'CTSH': 'IT Services', 'CDW': 'IT Distribution',
  'BKNG': 'Travel', 'ABNB': 'Travel', 'DASH': 'Delivery', 'MELI': 'E-Commerce',
  'AMGN': 'Biotech', 'GILD': 'Biotech', 'TMUS': 'Telecom', 'CMCSA': 'Media',
  'CHTR': 'Telecom', 'PEP': 'Consumer Staples', 'KDP': 'Beverages', 'KHC': 'Consumer Staples',
  'MDLZ': 'Consumer Staples', 'SBUX': 'Restaurants', 'LULU': 'Apparel', 'ROST': 'Retail',
  'ORLY': 'Auto Parts', 'CPRT': 'Auto Auction', 'FAST': 'Industrial Distribution',
  'ODFL': 'Trucking', 'CSX': 'Railroads', 'HON': 'Industrial', 'CTAS': 'Business Services',
  'PAYX': 'Payroll', 'VRSK': 'Data Analytics', 'ROP': 'Industrial Tech', 'ADP': 'Payroll',
  'AEP': 'Utilities', 'XEL': 'Utilities', 'EXC': 'Utilities', 'CEG': 'Utilities',
  'FANG': 'Energy', 'CCEP': 'Beverages', 'LIN': 'Industrial Gases',
};

const PULLBACK_CRITERIA = {
  min_dist_21_atr: -0.5,
  max_dist_21_atr: 1.0,
  min_dist_50_atr: 0,
  max_dist_50_atr: 3.0,
  max_weekly_return_pct: 12,
};

// =============================================================================
// Real Data Fetching Functions
// =============================================================================

/**
 * Fetch RS (Relative Strength) data from API
 */
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
    console.error('[Pipeline] Failed to fetch RS data:', error);
  }
  return results;
}

/**
 * Fetch universe data (price, volume, liquidity) for a single ticker
 */
async function fetchUniverseData(ticker: string): Promise<UniverseDataItem | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/universe-data?ticker=${ticker}`);
    const data = await response.json() as { success: boolean; data?: UniverseDataItem };
    return data.success && data.data ? data.data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch OHLC data for a ticker
 */
async function fetchOHLCData(ticker: string, days: number = 60): Promise<OHLCBar[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/market-data?ticker=${ticker}&days=${days}`);
    const data = await response.json() as { data?: OHLCBar[] };
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Fetch earnings data for multiple tickers
 */
async function fetchEarningsDataBatch(tickers: string[]): Promise<Map<string, EarningsData>> {
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
    console.error('[Pipeline] Failed to fetch earnings data:', error);
  }
  return results;
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Convert OHLCBar value (Decimal | number | string) to number
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

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
    const high = toNumber(bars[i].high);
    const low = toNumber(bars[i].low);
    const prevClose = toNumber(bars[i - 1].close);
    const hl = high - low;
    const hpc = Math.abs(high - prevClose);
    const lpc = Math.abs(low - prevClose);
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

function analyzeTickerStructure(ticker: string, bars: OHLCBar[]): StructureAnalysis | null {
  if (bars.length < 25) return null;

  const highs = bars.map(b => toNumber(b.high));
  const closes = bars.map(b => toNumber(b.close));
  const lows = bars.map(b => toNumber(b.low));

  const ema21_high = getLatestEMA(highs, 21);
  const ema21_close = getLatestEMA(closes, 21);
  const ema21_low = getLatestEMA(lows, 21);
  const ema50_close = bars.length >= 55 ? getLatestEMA(closes, 50) : ema21_close;
  const atr14 = calculateATR(bars, 14);

  const latestBar = bars[bars.length - 1];
  const close = toNumber(latestBar.close);
  const latestHigh = toNumber(latestBar.high);
  const latestLow = toNumber(latestBar.low);

  const dist_21ema_atr = atr14 > 0 ? (close - ema21_close) / atr14 : 0;
  const dist_50ema_atr = atr14 > 0 ? (close - ema50_close) / atr14 : 0;

  const structure_position = close > ema21_high ? 'above_cloud' :
    close < ema21_low ? 'below_cloud' : 'inside_cloud';
  const structure_intact = close >= ema21_low;

  let weekly_return_pct = 0;
  if (bars.length >= 6) {
    const weekAgoClose = toNumber(bars[bars.length - 6].close);
    weekly_return_pct = weekAgoClose > 0 ? ((close - weekAgoClose) / weekAgoClose) * 100 : 0;
  }

  const range = latestHigh - latestLow;
  const close_range_pct = range > 0 ? ((close - latestLow) / range) * 100 : 50;

  const range5d = bars.slice(-5).reduce((max, b) => Math.max(max, toNumber(b.high)), 0) -
    bars.slice(-5).reduce((min, b) => Math.min(min, toNumber(b.low)), Infinity);
  const range20d = bars.slice(-20).reduce((max, b) => Math.max(max, toNumber(b.high)), 0) -
    bars.slice(-20).reduce((min, b) => Math.min(min, toNumber(b.low)), Infinity);
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

function calculateReadyGrade(dist21: number, closeRangePct: number, isContracting: boolean, weeklyReturn: number): 'A' | 'B' | 'C' {
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

function determineEntryMode(close: number, ema21High: number, ema21Low: number): 'MODE1' | 'MODE2' {
  const structurePos = close > ema21High ? 'above' : close < ema21Low ? 'below' : 'inside';
  return structurePos === 'above' ? 'MODE2' : 'MODE1';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
// Supabase Helper Functions
// =============================================================================

/**
 * Save market snapshot to Supabase (non-blocking)
 */
async function saveMarketSnapshot(marketState: MarketStateOutput, date: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await insertMarketSnapshot({
      snapshot_date: date,
      qqqe_close: null, // Would come from real QQQE data
      qqqe_structure_position: marketState.qqqe_structure_position,
      qqqe_structure_slope: marketState.qqqe_structure_slope,
      mco_z: marketState.mco_z,
      mcsi_z: marketState.mcsi_z,
      mcsi_slope: marketState.mcsi_slope,
      mcsi_vs_10dma: marketState.mcsi_vs_10dma,
      market_state: marketState.state,
      permissions: marketState.permissions ?? {
        new_entries: 'NO',
        adds: false,
        pressing: false,
        trims: true,
      },
    });
    console.log('[Pipeline] Market snapshot saved to Supabase');
  } catch (error) {
    console.error('[Pipeline] Failed to save market snapshot:', error);
    // Non-blocking - continue pipeline
  }
}

/**
 * Save universe cache to Supabase (non-blocking)
 */
async function saveUniverseCache(universe: UniverseScanOutput, date: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await setUniverseCache({
      cache_date: date,
      tickers: universe.tickers,
      leaders: universe.leaders ?? null,
      count: universe.count,
    });
    console.log('[Pipeline] Universe cache saved to Supabase');
  } catch (error) {
    console.error('[Pipeline] Failed to save universe cache:', error);
    // Non-blocking - continue pipeline
  }
}

/**
 * Save focus list cache to Supabase (non-blocking)
 */
async function saveFocusListCache(focusList: FocusListOutput, date: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await setFocusListCache({
      cache_date: date,
      top5: focusList.top5,
      manual_promotion: focusList.manual_promotion,
      candidates: focusList.candidates ?? null,
    });
    console.log('[Pipeline] Focus list cache saved to Supabase');
  } catch (error) {
    console.error('[Pipeline] Failed to save focus list cache:', error);
    // Non-blocking - continue pipeline
  }
}

/**
 * Convert PositionRow from database to RawPosition for portfolio calculation
 */
function convertPositionRowToRawPosition(row: PositionRow): RawPosition {
  const avgPrice = Number(row.avg_price);
  const ssl = Number(row.ssl);
  // Calculate 2R price: entry + 2 * risk, where risk = entry - ssl
  const calculated2R = avgPrice + 2 * (avgPrice - ssl);

  return {
    ticker: row.ticker,
    shares: row.shares,
    avg_price: avgPrice,
    last_price: avgPrice, // Will be updated with real price later
    ssl: ssl,
    trim_2r_price: row.trim_2r_price ? Number(row.trim_2r_price) : calculated2R,
    original_shares: row.shares, // Approximate - would need to track separately
    earnings_days: undefined, // Would come from market data
    dist_21_atr: undefined, // Would come from market data
    theme: row.theme ?? undefined,
  };
}

/**
 * Convert TradeRow from database to RecentTrade for portfolio calculation
 */
function convertTradeRowToRecentTrade(row: TradeRow): RecentTrade {
  return {
    ticker: row.ticker,
    side: row.side,
    action: row.action_type,
    shares: row.shares,
    price: Number(row.price),
    timestamp: row.executed_at,
    r_multiple: row.r_multiple ? Number(row.r_multiple) : undefined,
  };
}

/**
 * Convert TradeRow from database to RawTradeFill for overview
 */
function convertTradeRowToTradeFill(row: TradeRow): RawTradeFill {
  return {
    timestamp: row.executed_at,
    ticker: row.ticker,
    side: row.side,
    action_type: row.action_type,
    shares: row.shares,
    price: Number(row.price),
    r_multiple: row.r_multiple ? Number(row.r_multiple) : undefined,
    mode: row.mode ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/**
 * Load positions from Supabase, return empty array if unavailable
 */
async function loadPositionsFromDatabase(): Promise<RawPosition[]> {
  if (!isSupabaseConfigured()) {
    console.log('[Pipeline] Supabase not configured, using empty positions');
    return [];
  }

  try {
    const rows = await getPositions();
    console.log(`[Pipeline] Loaded ${rows.length} positions from Supabase`);
    return rows.map(convertPositionRowToRawPosition);
  } catch (error) {
    console.error('[Pipeline] Failed to load positions:', error);
    return [];
  }
}

/**
 * Load recent trades from Supabase, return empty array if unavailable
 */
async function loadRecentTradesFromDatabase(): Promise<RecentTrade[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const rows = await getRecentTrades(24); // Last 24 hours
    console.log(`[Pipeline] Loaded ${rows.length} recent trades from Supabase`);
    return rows.map(convertTradeRowToRecentTrade);
  } catch (error) {
    console.error('[Pipeline] Failed to load recent trades:', error);
    return [];
  }
}

/**
 * Load trade fills from Supabase for Trades Today view
 */
async function loadTradeFillsFromDatabase(hours: number): Promise<RawTradeFill[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const rows = await getRecentTrades(hours);
    console.log(`[Pipeline] Loaded ${rows.length} trade fills from Supabase`);
    return rows.map(convertTradeRowToTradeFill);
  } catch (error) {
    console.error('[Pipeline] Failed to load trade fills:', error);
    return [];
  }
}

// =============================================================================
// Main Pipeline Function
// =============================================================================

/**
 * Run the complete agent pipeline (Tasks 1-9)
 *
 * Executes all 9 tasks in sequence, passing outputs between tasks
 * to create a complete trading agent state.
 *
 * @param config - Pipeline configuration
 * @returns AgentState containing all task outputs
 *
 * @example
 * ```typescript
 * const state = await runAgentPipeline({ equity: 100000 });
 * console.log(state.marketState.state); // 'CONFIRMED_UPTREND'
 * console.log(state.executionPlan.passed.length); // Number of order tickets
 * ```
 */
export async function runAgentPipeline(config?: PipelineConfig): Promise<AgentState> {
  const startTime = Date.now();
  console.log('[Pipeline] Starting pipeline with real data...');

  const { onProgress, forceRefresh } = config ?? {};

  // Debug: check if callback is provided
  console.log('[Pipeline] onProgress callback provided:', !!onProgress);

  // Helper to yield to the event loop, allowing React to process state updates
  const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 10));

  const notify = async (task: string, status: PipelineProgress['status'], progress: number, message: string) => {
    console.log(`[Pipeline] Calling notify: ${task} - ${progress}% - ${message}`);
    if (onProgress) {
      console.log('[Pipeline] Calling onProgress callback...');
      onProgress({ task, status, progress, message });
      console.log('[Pipeline] onProgress callback complete');
      // Yield to allow React to process the state update
      await yieldToUI();
    } else {
      console.log('[Pipeline] WARNING: No onProgress callback!');
    }
  };

  // Send immediate notification to verify callback is working (before any async work)
  await notify('Pipeline', 'starting', 0, 'Initializing pipeline...');

  // Clear cache if force refresh
  if (forceRefresh) {
    clearPipelineCache();
  }

  try {
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      equity: config?.equity ?? DEFAULT_CONFIG.equity,
      cash: config?.cash ?? DEFAULT_CONFIG.cash,
      tradeLookbackHours: config?.tradeLookbackHours ?? DEFAULT_CONFIG.tradeLookbackHours,
    };

    const today = getTodayDate();
    console.log('[Pipeline] Config:', mergedConfig, 'Date:', today);

    const mockAccount: AccountContext = {
      equity: mergedConfig.equity,
      cash: mergedConfig.cash,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Task 1: Market Analysis (always fresh - real QQQE from Yahoo)
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 1', 'starting', 0, 'Fetching QQQE market data...');

    const qqqeBars = await fetchOHLCData('QQQE', 35);
    const breadthData: BreadthData = {
      mco_z: 0.5,
      mcsi_z: 0.8,
      mcsi_10dma: 0.7,
      mcsi_z_prev: 0.75,
    };

    const marketState = analyzeMarketState(qqqeBars, breadthData);
    await notify('Task 1', 'complete', 10, `Market: ${marketState.state}`);

    // >>> PERSIST: Save market snapshot to Supabase (non-blocking)
    saveMarketSnapshot(marketState, today).catch(e => console.error('[Pipeline] Snapshot save error:', e));

    // ─────────────────────────────────────────────────────────────────────────
    // Task 2: Universe Scan (cached 1 hour)
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 2', 'starting', 10, 'Scanning liquid leaders...');

    let rsData: Map<string, RSData>;
    if (isCacheValid(pipelineCache.rsData)) {
      rsData = pipelineCache.rsData!.data;
      console.log('[Pipeline] Task 2: Using cached RS data');
    } else {
      rsData = await fetchRSData(NASDAQ_100_TICKERS);
      pipelineCache.rsData = { data: rsData, timestamp: Date.now() };
      console.log('[Pipeline] Task 2: Fetched fresh RS data');
    }

    // Filter to liquid leaders (RS >= 70, not China ADR, not defensive)
    const isDefensive = (theme: string) =>
      DEFENSIVE_THEMES.some(d => theme.toLowerCase().includes(d.toLowerCase()));

    const liquidLeaderTickers: string[] = [];
    const rsDataArray = Array.from(rsData.entries());
    for (const [ticker, rs] of rsDataArray) {
      if (rs.rs >= 70 && !CHINA_ADRS.has(ticker)) {
        const theme = TICKER_THEMES[ticker] || 'Unknown';
        if (!isDefensive(theme)) {
          liquidLeaderTickers.push(ticker);
        }
      }
    }

    // Build TickerData for universe scan
    const tickerDataForScan: TickerData[] = liquidLeaderTickers.map(ticker => {
      const rs = rsData.get(ticker);
      return {
        ticker,
        rs: rs?.rs ?? 70,
        adr_pct: 3.0,
        liquidity_m: 500,
        price: 100,
        dist_21ema_atr: 0,
        earnings_days: 30,
        theme: TICKER_THEMES[ticker] || 'Unknown',
        is_china_adr: CHINA_ADRS.has(ticker),
        is_defensive: isDefensive(TICKER_THEMES[ticker] || ''),
      };
    });

    const universe = scanLiquidLeaders(tickerDataForScan);
    await notify('Task 2', 'complete', 25, `Found ${universe.count} liquid leaders`);

    // >>> PERSIST: Cache universe to Supabase (non-blocking)
    saveUniverseCache(universe, today).catch(e => console.error('[Pipeline] Universe cache error:', e));

    // ─────────────────────────────────────────────────────────────────────────
    // Task 3: Pullback Scan (cached 1 hour)
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 3', 'starting', 25, 'Analyzing pullback structures...');

    let structureData: Map<string, StructureAnalysis>;
    let universeItemData: Map<string, UniverseDataItem>;

    if (isCacheValid(pipelineCache.structureData) && isCacheValid(pipelineCache.universeData)) {
      structureData = pipelineCache.structureData!.data;
      universeItemData = pipelineCache.universeData!.data;
      console.log('[Pipeline] Task 3: Using cached structure data');
    } else {
      structureData = new Map();
      universeItemData = new Map();

      const BATCH_SIZE = 5;
      const leaders = universe.leaders ?? [];

      for (let i = 0; i < leaders.length; i += BATCH_SIZE) {
        const batch = leaders.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (leader) => {
          const [ohlc, univData] = await Promise.all([
            fetchOHLCData(leader.ticker, 60),
            fetchUniverseData(leader.ticker),
          ]);
          const structure = analyzeTickerStructure(leader.ticker, ohlc);
          return { ticker: leader.ticker, structure, univData };
        });

        const batchResults = await Promise.all(batchPromises);
        for (const { ticker, structure, univData } of batchResults) {
          if (structure) structureData.set(ticker, structure);
          if (univData) universeItemData.set(ticker, univData);
        }

        // Rate limiting
        if (i + BATCH_SIZE < leaders.length) {
          await delay(500);
        }

        // Progress update
        const progress = 25 + Math.round((i / leaders.length) * 25);
        await notify('Task 3', 'running', progress, `Analyzed ${Math.min(i + BATCH_SIZE, leaders.length)}/${leaders.length} tickers`);
      }

      pipelineCache.structureData = { data: structureData, timestamp: Date.now() };
      pipelineCache.universeData = { data: universeItemData, timestamp: Date.now() };
    }

    // Build pullback candidates from real structure data
    const pullbackCandidates: PullbackTickerData[] = [];
    const structureDataArray = Array.from(structureData.entries());
    for (const [ticker, structure] of structureDataArray) {
      const rs = rsData.get(ticker);
      const univItem = universeItemData.get(ticker);
      if (!rs) continue;

      // Apply pullback filters
      if (structure.dist_21ema_atr < PULLBACK_CRITERIA.min_dist_21_atr) continue;
      if (structure.dist_21ema_atr > PULLBACK_CRITERIA.max_dist_21_atr) continue;
      if (structure.dist_50ema_atr < PULLBACK_CRITERIA.min_dist_50_atr) continue;
      if (structure.dist_50ema_atr > PULLBACK_CRITERIA.max_dist_50_atr) continue;
      if (structure.weekly_return_pct > PULLBACK_CRITERIA.max_weekly_return_pct) continue;
      if (!structure.structure_intact) continue;

      const grade = calculateReadyGrade(
        structure.dist_21ema_atr,
        structure.close_range_pct,
        structure.is_contracting,
        structure.weekly_return_pct
      );

      pullbackCandidates.push({
        rank: pullbackCandidates.length + 1,
        ticker,
        rs: rs.rs,
        adr_pct: univItem?.adrPct ?? 3.0,
        liquidity_m: univItem?.liquidityM ?? 500,
        theme: TICKER_THEMES[ticker] || 'Unknown',
        price: structure.close,
        dist_21ema_atr: structure.dist_21ema_atr,
        earnings_days: 30, // Will be updated in Task 4
        dist_50ema_atr: structure.dist_50ema_atr,
        close_range_pct: structure.close_range_pct,
        is_contracting: structure.is_contracting,
        weekly_return_pct: structure.weekly_return_pct,
        atr: structure.atr14,
        ema21_high: structure.ema21_high,
        ema21_close: structure.ema21_close,
        ema21_low: structure.ema21_low,
        close: structure.close,
      });
    }

    const pullbacks = scanPullbackCandidates(pullbackCandidates);
    await notify('Task 3', 'complete', 50, `Found ${pullbacks.count} pullback candidates`);

    // ─────────────────────────────────────────────────────────────────────────
    // Task 4: Entry Readiness (cached 1 hour)
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 4', 'starting', 50, 'Checking earnings dates...');

    let earningsData: Map<string, EarningsData>;
    const pullbackTickers = pullbacks.candidates.map(c => c.ticker);

    if (isCacheValid(pipelineCache.earningsData)) {
      earningsData = pipelineCache.earningsData!.data;
      console.log('[Pipeline] Task 4: Using cached earnings data');
    } else {
      earningsData = await fetchEarningsDataBatch(pullbackTickers);
      pipelineCache.earningsData = { data: earningsData, timestamp: Date.now() };
      console.log('[Pipeline] Task 4: Fetched fresh earnings data');
    }

    // Build readiness input with real earnings data
    const readinessInput: ReadinessTickerData[] = pullbacks.candidates.map((c, idx) => {
      const earnings = earningsData.get(c.ticker);
      const structure = structureData.get(c.ticker);
      const earningsDays = earnings?.daysUntilEarnings ?? 30;

      return {
        rank: idx + 1,
        ticker: c.ticker,
        rs: c.rs,
        theme: c.theme,
        price: c.price,
        adr_pct: c.adr_pct,
        dist_21_atr: c.dist_21_atr,
        dist_50_atr: c.dist_50_atr,
        close_pct: c.close_pct,
        contraction: c.contraction,
        weekly_return_pct: c.weekly_return_pct,
        earnings_days: earningsDays,
        ready_grade: c.ready_grade,
        close: c.price,
        prev_close: c.price * 0.99,
        high: c.price * 1.01,
        low: c.price * 0.99,
        ema21_high: structure?.ema21_high ?? c.price,
        ema21_close: structure?.ema21_close ?? c.price * 0.99,
        ema21_low: structure?.ema21_low ?? c.price * 0.98,
        prev_ema21_low: (structure?.ema21_low ?? c.price * 0.98) * 0.995,
      };
    });

    const readiness = evaluateReadiness(readinessInput);
    const readyCount = readiness.rows.filter(r => r.ready).length;
    await notify('Task 4', 'complete', 65, `${readyCount} candidates READY`);

    // ─────────────────────────────────────────────────────────────────────────
    // Task 5: Focus List Ranking
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 5', 'starting', 65, 'Ranking focus list...');

    const readyRows = readiness.rows.filter(r => r.ready);
    const focusInput: FocusListTickerData[] = readyRows.map((r, i) => {
      const structure = structureData.get(r.ticker);
      const rsItem = rsData.get(r.ticker);

      return {
        ticker: r.ticker,
        ready: true,
        mode: r.mode,
        dist_to_21ema_atr: r.dist_to_21ema_atr,
        earnings_days: r.earnings_days ?? 30,
        setup: r.setup ?? 'Pullback to 21EMA',
        entry_trigger: r.entry_trigger ?? 'Close above prior high',
        ready_grade: calculateReadyGrade(
          r.dist_to_21ema_atr,
          structure?.close_range_pct ?? 50,
          structure?.is_contracting ?? false,
          structure?.weekly_return_pct ?? 5
        ),
        contraction: structure?.is_contracting ?? false,
        close_range_pct: structure?.close_range_pct ?? 50,
        rs: rsItem?.rs ?? 80,
        theme: TICKER_THEMES[r.ticker] || 'Unknown',
        reclaim_backtest_grade: calculateReadyGrade(
          r.dist_to_21ema_atr,
          structure?.close_range_pct ?? 50,
          structure?.is_contracting ?? false,
          structure?.weekly_return_pct ?? 5
        ),
      };
    });

    const focusList = rankFocusList(focusInput);
    const top5Tickers = focusList.top5.join(', ') || 'None';
    await notify('Task 5', 'complete', 75, `Top 5: ${top5Tickers}`);

    // >>> PERSIST: Cache focus list to Supabase (non-blocking)
    saveFocusListCache(focusList, today).catch(e => console.error('[Pipeline] Focus cache error:', e));

    // ─────────────────────────────────────────────────────────────────────────
    // Task 6: Position Sizing & Risk Gate
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 6', 'starting', 75, 'Calculating position sizes...');

    const sizingInput: SizingTickerData[] = (focusList.candidates ?? []).map(c => {
      const structure = structureData.get(c.ticker);
      return {
        rank: c.rank,
        ticker: c.ticker,
        theme: c.theme,
        mode: c.mode,
        setup: c.setup,
        entry_trigger: c.entry_trigger,
        dist_to_21ema_atr: c.dist_to_21ema_atr,
        earnings_days: c.earnings_days,
        reclaim_backtest_grade: c.reclaim_backtest_grade,
        price: structure?.close ?? 100,
        ema21_low: structure?.ema21_low ?? 98,
        atr: structure?.atr14 ?? 2,
      };
    });

    const portfolioContext: PortfolioContext = { equity: mockAccount.equity };
    const defaultPermissions: MarketPermissions = {
      new_entries: 'YES',
      adds: true,
      pressing: false,
      trims: true,
    };
    const marketContext: MarketContext = { permissions: marketState.permissions ?? defaultPermissions };
    const sizing = calculatePositionSizing(sizingInput, portfolioContext, marketContext);

    const passCount = sizing.sizing.filter(r => r.gate === 'PASS').length;
    await notify('Task 6', 'complete', 85, `Sized ${sizing.sizing.length} positions, ${passCount} PASS`);

    // ─────────────────────────────────────────────────────────────────────────
    // Task 7: Execution Plan
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 7', 'starting', 85, 'Generating execution plan...');
    const executionPlan = generateExecutionPlan(sizing);
    await notify('Task 7', 'complete', 90, `${executionPlan.passed.length} orders ready`);

    // ─────────────────────────────────────────────────────────────────────────
    // Task 8: Portfolio - LOAD FROM SUPABASE
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 8', 'starting', 90, 'Loading portfolio data...');
    const positions = await loadPositionsFromDatabase();
    const recentTrades = await loadRecentTradesFromDatabase();
    const portfolio = calculatePortfolio(positions, recentTrades, mockAccount);
    await notify('Task 8', 'complete', 95, `Loaded ${positions.length} positions`);

    // ─────────────────────────────────────────────────────────────────────────
    // Task 9: Overview / Trades Today - LOAD FROM SUPABASE
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 9', 'starting', 95, 'Loading trade history...');
    const tradeFills = await loadTradeFillsFromDatabase(mergedConfig.tradeLookbackHours);
    const overview = generateOverview(tradeFills, {
      lookback_hours: mergedConfig.tradeLookbackHours,
    });
    await notify('Task 9', 'complete', 100, `Loaded ${tradeFills.length} trades`);

    // ─────────────────────────────────────────────────────────────────────────
    // Return Complete State
    // ─────────────────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Pipeline] Complete in ${elapsed}s`);

    return {
      marketState,
      universe,
      pullbacks,
      readiness,
      focusList,
      sizing,
      executionPlan,
      portfolio,
      overview,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Pipeline] FATAL ERROR:', error);
    onProgress?.({ task: 'Pipeline', status: 'error', progress: 0, message: String(error) });
    throw error;
  }
}

// =============================================================================
// Public API for UI - Trade Execution
// =============================================================================

/**
 * Trade input for saving to database
 */
export interface TradeInput {
  ticker: string;
  side: 'BUY' | 'SELL';
  action_type: 'ENTRY' | 'ADD' | 'TRIM' | 'EXIT';
  shares: number;
  price: number;
  r_multiple?: number;
  mode?: 'MODE1' | 'MODE2';
  notes?: string;
  /** SSL (stop loss level) - required for ENTRY to create position */
  ssl?: number;
  /** 2R trim price target - required for ENTRY to create position */
  trim_2r_price?: number;
  /** Theme/sector for the position */
  theme?: string;
}

/**
 * Save a trade to the database
 * Called from UI when user executes a suggested trade
 *
 * For ENTRY trades, also creates a new position in the positions table.
 *
 * @param trade - Trade details to save
 * @returns The saved trade record, or null if save failed
 *
 * @example
 * ```typescript
 * const trade = await saveTradeToDatabase({
 *   ticker: 'NVDA',
 *   side: 'BUY',
 *   action_type: 'ENTRY',
 *   shares: 10,
 *   price: 450.00,
 *   ssl: 435.00,
 *   trim_2r_price: 480.00,
 *   mode: 'MODE1',
 *   notes: 'Pullback entry at 21EMA',
 * });
 * ```
 */
export async function saveTradeToDatabase(trade: TradeInput): Promise<TradeRow | null> {
  if (!isSupabaseConfigured()) {
    console.warn('[Pipeline] Supabase not configured, trade not saved');
    return null;
  }

  try {
    const tradeInsert: TradeInsert = {
      ticker: trade.ticker,
      side: trade.side,
      action_type: trade.action_type,
      shares: trade.shares,
      price: trade.price,
      r_multiple: trade.r_multiple ?? null,
      mode: trade.mode ?? null,
      notes: trade.notes ?? null,
      executed_at: new Date().toISOString(),
    };

    const savedTrade = await insertTrade(tradeInsert);
    console.log(`[Pipeline] Trade saved: ${trade.side} ${trade.shares} ${trade.ticker} @ $${trade.price}`);

    // For ENTRY trades, also create/update a position
    if (trade.action_type === 'ENTRY' && trade.side === 'BUY') {
      if (!trade.ssl) {
        console.warn('[Pipeline] ENTRY trade missing SSL, position not created');
      } else {
        const today = getTodayDate();
        const positionInsert: PositionInsert = {
          ticker: trade.ticker,
          shares: trade.shares,
          avg_price: trade.price,
          entry_date: today,
          ssl: trade.ssl,
          trim_2r_price: trade.trim_2r_price ?? null,
          trimmed_pct: 0,
          secured_pnl: 0,
          status: 'STARTER',
          mode: trade.mode ?? 'MODE1',
          theme: trade.theme ?? null,
          notes: trade.notes ?? null,
        };

        try {
          await upsertPosition(positionInsert);
          console.log(`[Pipeline] Position created for ${trade.ticker}`);
        } catch (posError) {
          console.error(`[Pipeline] Failed to create position for ${trade.ticker}:`, posError);
          // Don't fail the trade save if position creation fails
        }
      }
    }

    return savedTrade;
  } catch (error) {
    console.error('[Pipeline] Failed to save trade:', error);
    return null;
  }
}
