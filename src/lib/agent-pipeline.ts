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
  updatePosition,
  deletePosition,
  getPositionByTicker,
  getTodayDate,
  PositionRow,
  PositionInsert,
  TradeRow,
  TradeInsert,
} from '@/lib/supabase';

import {
  getBreadthData,
  getBreadthHistory,
  type BreadthData as SupabaseBreadthData,
} from '@/lib/market-data';

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
  // New fields for expanded filters
  volumeM?: number;           // Volume in millions of shares
  marketCapB?: number;        // Market cap in billions
  ema21?: number;             // 21-day EMA
  ema21_prev?: number;        // Previous day 21-day EMA
  is21EmaAdvancing?: boolean; // Whether 21EMA is rising
  wma10?: number;             // 10-week MA (approx 50-day)
  wma10_prev?: number;        // Previous 10-week MA
  is10WmaAdvancing?: boolean; // Whether 10WMA is rising
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

interface DailyScanResult {
  ticker: string;
  name: string;
  rs: number;
  price: number;
  liquidityM: number;
  volumeM: number;
  marketCapB: number;
  adrPct: number;
  is21EmaAdvancing: boolean;
  is10WmaAdvancing: boolean;
}

const DAILY_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const DAILY_SCAN_STORAGE_KEY = 'pipeline_daily_scan_cache';

const pipelineCache: {
  rsData: CacheEntry<Map<string, RSData>> | null;
  universeData: CacheEntry<Map<string, UniverseDataItem>> | null;
  structureData: CacheEntry<Map<string, StructureAnalysis>> | null;
  earningsData: CacheEntry<Map<string, EarningsData>> | null;
  dailyScan: CacheEntry<DailyScanResult[]> | null;
} = {
  rsData: null,
  universeData: null,
  structureData: null,
  earningsData: null,
  dailyScan: null,
};

/**
 * Load daily scan cache from localStorage (survives page refreshes)
 */
function loadDailyScanFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(DAILY_SCAN_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as CacheEntry<DailyScanResult[]>;
      if (Date.now() - parsed.timestamp < DAILY_CACHE_DURATION_MS) {
        pipelineCache.dailyScan = parsed;
        console.log(`[Pipeline] Loaded daily scan from storage (${parsed.data.length} leaders, ${Math.round((Date.now() - parsed.timestamp) / 60000)}min old)`);
      } else {
        localStorage.removeItem(DAILY_SCAN_STORAGE_KEY);
        console.log('[Pipeline] Stored daily scan expired, will run fresh scan');
      }
    }
  } catch (e) {
    console.error('[Pipeline] Failed to load daily scan from storage:', e);
  }
}

/**
 * Save daily scan cache to localStorage
 */
function saveDailyScanToStorage(cache: CacheEntry<DailyScanResult[]>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DAILY_SCAN_STORAGE_KEY, JSON.stringify(cache));
    console.log('[Pipeline] Saved daily scan to storage');
  } catch (e) {
    console.error('[Pipeline] Failed to save daily scan to storage:', e);
  }
}

/**
 * Clear daily scan from localStorage
 */
function clearDailyScanFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DAILY_SCAN_STORAGE_KEY);
  } catch (e) {
    // Ignore
  }
}

// Load cached daily scan on module init (client-side only)
if (typeof window !== 'undefined') {
  loadDailyScanFromStorage();
}

function isCacheValid<T>(entry: CacheEntry<T> | null): boolean {
  return entry !== null && Date.now() - entry.timestamp < CACHE_DURATION_MS;
}

function isDailyCacheValid<T>(entry: CacheEntry<T> | null): boolean {
  return entry !== null && Date.now() - entry.timestamp < DAILY_CACHE_DURATION_MS;
}

/**
 * Clear the pipeline cache (for EOD refresh or forced refresh)
 */
export function clearPipelineCache(): void {
  pipelineCache.rsData = null;
  pipelineCache.universeData = null;
  pipelineCache.structureData = null;
  pipelineCache.earningsData = null;
  pipelineCache.dailyScan = null;
  clearDailyScanFromStorage(); // Also clear localStorage
  console.log('[Pipeline] Cache cleared (full, including storage)');
}

/**
 * Quick cache clear - keeps daily scan cache, only clears structure/analysis data
 * Use this for testing when you don't need to re-scan the full Nasdaq universe
 */
export function clearQuickCache(): void {
  pipelineCache.rsData = null;
  pipelineCache.universeData = null;
  pipelineCache.structureData = null;
  pipelineCache.earningsData = null;
  // Keep dailyScan cache intact - it's valid for 24 hours
  console.log('[Pipeline] Quick cache cleared (kept daily scan)');
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
  min_dist_21_atr: -3.0,   // Widened to capture deeper pullbacks
  max_dist_21_atr: 4.0,    // Widened to include extended stocks
  // dist_50 filter removed to maximize candidates
  max_weekly_return_pct: 20, // Increased to allow more setups
};

// =============================================================================
// Breadth Calculation (Nasdaq-100 MCO/MCSI)
// =============================================================================

interface CalculatedBreadth {
  mco: number;
  mcsi: number;
  mcoZscore: number;
  mcsiZscore: number;
  mcoChange: number;
  mcsiChange: number;
  advances: number;
  declines: number;
}

/**
 * Calculate Nasdaq-100 breadth indicators from OHLC data
 * MCO = 19-day EMA(Net Advances) - 39-day EMA(Net Advances)
 * MCSI = Cumulative sum of MCO
 */
async function calculateNasdaq100BreadthFromOHLC(
  tickers: string[],
  lookbackDays: number = 252
): Promise<{ today: CalculatedBreadth | null; yesterday: CalculatedBreadth | null }> {
  console.log('[Pipeline] Calculating Nasdaq-100 breadth...');

  try {
    // Fetch OHLC data for all tickers
    const ohlcData = new Map<string, OHLCBar[]>();

    // Fetch in batches of 10 to avoid rate limiting
    const BATCH_SIZE = 10;
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (ticker) => {
        const bars = await fetchOHLCData(ticker, lookbackDays);
        return { ticker, bars };
      });

      const batchResults = await Promise.all(batchPromises);
      for (const { ticker, bars } of batchResults) {
        if (bars.length > 0) {
          ohlcData.set(ticker, bars);
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < tickers.length) {
        await delay(200);
      }
    }

    // Get all unique dates across all tickers
    const allDates = new Set<string>();
    const ohlcValues = Array.from(ohlcData.values());
    for (const bars of ohlcValues) {
      for (const bar of bars) {
        allDates.add(bar.date);
      }
    }

    const sortedDates = Array.from(allDates).sort();
    if (sortedDates.length < 40) {
      console.log('[Pipeline] Insufficient data for breadth calculation');
      return { today: null, yesterday: null };
    }

    // Calculate daily advances/declines
    const dailyData: Array<{ date: string; advances: number; declines: number; netAdv: number }> = [];

    for (let i = 1; i < sortedDates.length; i++) {
      const date = sortedDates[i];
      const prevDate = sortedDates[i - 1];

      let advances = 0;
      let declines = 0;

      const ohlcEntries = Array.from(ohlcData.entries());
      for (const [_ticker, bars] of ohlcEntries) {
        const todayBar = bars.find((b: OHLCBar) => b.date === date);
        const prevBar = bars.find((b: OHLCBar) => b.date === prevDate);

        if (todayBar && prevBar) {
          const todayClose = toNumber(todayBar.close);
          const prevClose = toNumber(prevBar.close);
          if (todayClose > prevClose) advances++;
          else if (todayClose < prevClose) declines++;
        }
      }

      dailyData.push({ date, advances, declines, netAdv: advances - declines });
    }

    // Calculate EMAs for MCO
    const netAdvances = dailyData.map(d => d.netAdv);
    const ema19 = calculateEMA(netAdvances, 19);
    const ema39 = calculateEMA(netAdvances, 39);

    // Calculate MCO and MCSI
    const mcoValues: number[] = [];
    const mcsiValues: number[] = [];
    let cumMcsi = 0;

    for (let i = 0; i < dailyData.length; i++) {
      if (i >= 38) { // Need at least 39 days for both EMAs
        const mco = ema19[i] - ema39[i];
        cumMcsi += mco;
        mcoValues.push(mco);
        mcsiValues.push(cumMcsi);
      }
    }

    // Calculate z-scores (rolling 252-day window)
    const calcZscore = (values: number[], idx: number, window: number = 252): number => {
      const start = Math.max(0, idx - window + 1);
      const slice = values.slice(start, idx + 1);
      if (slice.length < 20) return 0;

      const mean = slice.reduce((a: number, b: number) => a + b, 0) / slice.length;
      const variance = slice.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / slice.length;
      const stdev = Math.sqrt(variance);
      return stdev > 0 ? (values[idx] - mean) / stdev : 0;
    };

    const lastIdx = mcoValues.length - 1;
    const prevIdx = mcoValues.length - 2;

    if (lastIdx < 1) {
      return { today: null, yesterday: null };
    }

    const todayAdv = dailyData[dailyData.length - 1]?.advances ?? 0;
    const todayDec = dailyData[dailyData.length - 1]?.declines ?? 0;

    const today: CalculatedBreadth = {
      mco: mcoValues[lastIdx],
      mcsi: mcsiValues[lastIdx],
      mcoZscore: calcZscore(mcoValues, lastIdx),
      mcsiZscore: calcZscore(mcsiValues, lastIdx),
      mcoChange: mcoValues[lastIdx] - mcoValues[prevIdx],
      mcsiChange: mcsiValues[lastIdx] - mcsiValues[prevIdx],
      advances: todayAdv,
      declines: todayDec,
    };

    const yesterday: CalculatedBreadth | null = prevIdx >= 0 ? {
      mco: mcoValues[prevIdx],
      mcsi: mcsiValues[prevIdx],
      mcoZscore: calcZscore(mcoValues, prevIdx),
      mcsiZscore: calcZscore(mcsiValues, prevIdx),
      mcoChange: prevIdx > 0 ? mcoValues[prevIdx] - mcoValues[prevIdx - 1] : 0,
      mcsiChange: prevIdx > 0 ? mcsiValues[prevIdx] - mcsiValues[prevIdx - 1] : 0,
      advances: 0,
      declines: 0,
    } : null;

    console.log(`[Pipeline] Breadth calculated: MCO=${today.mco.toFixed(2)}, MCSI=${today.mcsi.toFixed(2)}, MCO Change=${today.mcoChange.toFixed(2)}`);

    return { today, yesterday };
  } catch (error) {
    console.error('[Pipeline] Breadth calculation failed:', error);
    return { today: null, yesterday: null };
  }
}

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
  const trim2r = row.trim_2r_price ? Number(row.trim_2r_price) : calculated2R;

  console.log(`[Position] ${row.ticker}: entry=$${avgPrice.toFixed(2)}, ssl=$${ssl.toFixed(2)}, trim_2r=$${trim2r.toFixed(2)} (db: ${row.trim_2r_price})`);

  return {
    ticker: row.ticker,
    shares: row.shares,
    avg_price: avgPrice,
    last_price: avgPrice, // Will be updated with real price later
    ssl: ssl,
    trim_2r_price: trim2r,
    original_shares: row.shares, // Approximate - would need to track separately
    earnings_days: undefined, // Would come from market data
    dist_21_atr: undefined, // Would come from market data
    theme: row.theme ?? undefined,
    mode: row.mode,
    status: row.status,
    trimmed_pct: row.trimmed_pct,
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
 * Fetch current prices for a list of tickers
 * Uses the market-data API to get the most recent close price
 */
async function fetchCurrentPrices(tickers: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const failed: string[] = [];

  if (tickers.length === 0) {
    return prices;
  }

  console.log(`[Pipeline] Fetching current prices for ${tickers.length} tickers: ${tickers.join(', ')}`);

  // Fetch prices in parallel (limit concurrency to avoid rate limits)
  const BATCH_SIZE = 5;
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const bars = await fetchOHLCData(ticker, 5); // Just need recent price
          if (bars.length > 0) {
            // Get the most recent close price
            const lastBar = bars[bars.length - 1];
            console.log(`[Pipeline] ${ticker}: fetched price $${lastBar.close.toFixed(2)}`);
            return { ticker, price: lastBar.close };
          } else {
            console.warn(`[Pipeline] ${ticker}: no OHLC data returned`);
            failed.push(ticker);
          }
        } catch (error) {
          console.warn(`[Pipeline] ${ticker}: fetch error:`, error);
          failed.push(ticker);
        }
        return null;
      })
    );

    for (const result of results) {
      if (result) {
        prices.set(result.ticker, result.price);
      }
    }
  }

  console.log(`[Pipeline] Fetched prices for ${prices.size}/${tickers.length} tickers`);
  if (failed.length > 0) {
    console.warn(`[Pipeline] Failed to fetch prices for: ${failed.join(', ')}`);
  }
  return prices;
}

/**
 * Apply current market prices to positions
 */
function applyCurrentPrices(positions: RawPosition[], prices: Map<string, number>): RawPosition[] {
  return positions.map(pos => {
    const currentPrice = prices.get(pos.ticker);
    if (currentPrice !== undefined) {
      return {
        ...pos,
        last_price: currentPrice,
      };
    }
    return pos;
  });
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
    const positions = rows.map(convertPositionRowToRawPosition);

    // Fetch and apply current market prices
    if (positions.length > 0) {
      const tickers = positions.map(p => p.ticker);
      const prices = await fetchCurrentPrices(tickers);
      return applyCurrentPrices(positions, prices);
    }

    return positions;
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
    // Task 1: Market Analysis (always fresh - real QQQE + calculated breadth)
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 1', 'starting', 0, 'Fetching QQQE market data...');

    const qqqeBars = await fetchOHLCData('QQQE', 35);

    // Get breadth data from Supabase
    await notify('Task 1', 'running', 3, 'Fetching breadth data...');

    // Check if breadth data needs refresh
    let supabaseBreadth = await getBreadthData();
    const isBreadthStale = supabaseBreadth.date < today;

    // If stale and force refresh requested, calculate fresh breadth data
    if (isBreadthStale && forceRefresh) {
      await notify('Task 1', 'running', 5, 'Calculating fresh breadth data (this takes ~30s)...');
      console.log('[Pipeline] Breadth data stale, triggering update...');

      try {
        const updateResponse = await fetch(`${BASE_URL}/api/breadth-update`, {
          method: 'POST',
        });
        const updateResult = await updateResponse.json();

        if (updateResult.success && !updateResult.skipped) {
          console.log(`[Pipeline] Breadth updated: ${updateResult.latest?.date}`);
          // Re-fetch the updated data
          supabaseBreadth = await getBreadthData();
        }
      } catch (error) {
        console.error('[Pipeline] Breadth update failed:', error);
      }
    }

    // Get yesterday's data for direction calculation
    const breadthHistory = await getBreadthHistory(2);
    const yesterdayBreadth = breadthHistory.length > 1 ? breadthHistory[1] : null;

    console.log('[Pipeline] Breadth data:', JSON.stringify({
      date: supabaseBreadth.date,
      mco: supabaseBreadth.mco,
      mcsi: supabaseBreadth.mcsi,
      mco_z: supabaseBreadth.mco_z,
      yesterday_mco: yesterdayBreadth?.mco,
    }));

    // Build breadth data for market analysis
    const breadthData: BreadthData = {
      mco_z: supabaseBreadth.mco_z ?? 0,
      mcsi_z: supabaseBreadth.mcsi_z ?? 0,
      mcsi_10dma: supabaseBreadth.mcsi_z ?? 0,
      mcsi_z_prev: yesterdayBreadth?.mcsi_z ?? supabaseBreadth.mcsi_z ?? 0,
      // Raw values for direction calculation
      mco_value: supabaseBreadth.mco,
      mco_value_prev: yesterdayBreadth?.mco,
      mcsi_value: supabaseBreadth.mcsi,
      mcsi_value_prev: yesterdayBreadth?.mcsi,
    };

    const marketState = analyzeMarketState(qqqeBars, breadthData);
    marketState.breadth_date = supabaseBreadth.date;

    // Log stale data warning
    if (supabaseBreadth.date < today) {
      const breadthDateObj = new Date(supabaseBreadth.date);
      const todayDateObj = new Date(today);
      const daysDiff = Math.floor((todayDateObj.getTime() - breadthDateObj.getTime()) / (1000 * 60 * 60 * 24));
      console.warn(`[Pipeline] Breadth data is ${daysDiff} day(s) old (from ${supabaseBreadth.date})`);
    }

    console.log('[Pipeline] Market state:', JSON.stringify({
      state: marketState.state,
      mco_value: marketState.mco_value,
      breadth_direction: marketState.breadth_direction,
      breadth_date: marketState.breadth_date,
    }));
    const breadthDir = marketState.breadth_direction ?? 'FLAT';
    await notify('Task 1', 'complete', 10, `Market: ${marketState.state} | Breadth: ${breadthDir}`);

    // >>> PERSIST: Save market snapshot to Supabase (non-blocking)
    saveMarketSnapshot(marketState, today).catch(e => console.error('[Pipeline] Snapshot save error:', e));

    // ─────────────────────────────────────────────────────────────────────────
    // Task 2: Universe Scan (uses daily scan cache - 24 hours)
    // Full Nasdaq scan runs once per day, results cached for quick pipeline runs
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 2', 'starting', 10, 'Loading liquid leaders...');

    let dailyScanResults: DailyScanResult[];
    let universeItemData: Map<string, UniverseDataItem> = new Map();

    // Check if we have cached daily scan results
    if (isDailyCacheValid(pipelineCache.dailyScan)) {
      dailyScanResults = pipelineCache.dailyScan!.data;
      console.log(`[Pipeline] Task 2: Using cached daily scan (${dailyScanResults.length} liquid leaders)`);
      await notify('Task 2', 'running', 15, `Using cached scan: ${dailyScanResults.length} liquid leaders`);
    } else {
      // Need to run daily scan - this takes 2-3 minutes
      await notify('Task 2', 'running', 12, 'Running full Nasdaq scan (this takes 2-3 min)...');
      console.log('[Pipeline] Task 2: Running full daily scan...');

      try {
        const scanResponse = await fetch(`${BASE_URL}/api/daily-scan`, {
          method: 'POST',
        });
        const scanData = await scanResponse.json() as {
          success: boolean;
          liquidLeaders?: DailyScanResult[];
          stats?: { passedFilters: number };
        };

        if (scanData.success && Array.isArray(scanData.liquidLeaders)) {
          dailyScanResults = scanData.liquidLeaders;
          const cacheEntry = { data: dailyScanResults, timestamp: Date.now() };
          pipelineCache.dailyScan = cacheEntry;
          saveDailyScanToStorage(cacheEntry); // Persist to localStorage
          console.log(`[Pipeline] Task 2: Daily scan complete - ${dailyScanResults.length} liquid leaders`);
        } else {
          throw new Error('Daily scan failed');
        }
      } catch (error) {
        console.error('[Pipeline] Daily scan failed, falling back to Nasdaq-100:', error);
        await notify('Task 2', 'running', 15, 'Daily scan failed, using Nasdaq-100 fallback...');

        // Fallback to Nasdaq-100 only
        const rsData = await fetchRSData(NASDAQ_100_TICKERS);

        // Quick fetch of universe data for fallback
        for (let i = 0; i < NASDAQ_100_TICKERS.length; i += 20) {
          const batch = NASDAQ_100_TICKERS.slice(i, i + 20);
          try {
            const response = await fetch(`${BASE_URL}/api/universe-data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tickers: batch }),
            });
            const result = await response.json() as { success: boolean; data?: UniverseDataItem[] };
            if (result.success && Array.isArray(result.data)) {
              for (const item of result.data) {
                universeItemData.set(item.ticker, item);
              }
            }
          } catch {
            // Continue on error
          }
          await delay(200);
        }

        // Build fallback results
        dailyScanResults = [];
        for (const ticker of NASDAQ_100_TICKERS) {
          const rs = rsData.get(ticker);
          const univ = universeItemData.get(ticker);
          if (rs && univ && univ.liquidityM >= 250 && univ.volumeM >= 1 && univ.adrPct >= 2.5 && univ.adrPct <= 10) {
            dailyScanResults.push({
              ticker,
              name: ticker,
              rs: rs.rs,
              price: univ.price,
              liquidityM: univ.liquidityM,
              volumeM: univ.volumeM,
              marketCapB: univ.marketCapB ?? 0,
              adrPct: univ.adrPct,
              is21EmaAdvancing: univ.is21EmaAdvancing ?? false,
              is10WmaAdvancing: univ.is10WmaAdvancing ?? false,
            });
          }
        }
        dailyScanResults.sort((a, b) => b.rs - a.rs);
        dailyScanResults = dailyScanResults.slice(0, 40);
      }
    }

    // Build universeItemData from daily scan results for later use
    for (const stock of dailyScanResults) {
      universeItemData.set(stock.ticker, {
        ticker: stock.ticker,
        price: stock.price,
        avgVolume: 0,
        adrPct: stock.adrPct,
        liquidityM: stock.liquidityM,
        volumeM: stock.volumeM,
        marketCapB: stock.marketCapB,
        is21EmaAdvancing: stock.is21EmaAdvancing,
        is10WmaAdvancing: stock.is10WmaAdvancing,
      });
    }
    pipelineCache.universeData = { data: universeItemData, timestamp: Date.now() };

    // Build TickerData from daily scan results
    const tickerDataForScan: TickerData[] = dailyScanResults.map(stock => ({
      ticker: stock.ticker,
      rs: stock.rs,
      adr_pct: stock.adrPct,
      liquidity_m: stock.liquidityM,
      volume_m: stock.volumeM,
      price: stock.price,
      market_cap_b: stock.marketCapB,
      dist_21ema_atr: 0, // Will be calculated in Task 3
      earnings_days: 30, // Will be updated in Task 4
      theme: TICKER_THEMES[stock.ticker] || 'Technology',
      is_china_adr: false, // Already filtered in daily scan
      is_excluded_sector: false, // Already filtered in daily scan
    }));

    console.log(`[Pipeline] Task 2: Built TickerData for ${tickerDataForScan.length} liquid leaders`);

    const universe = scanLiquidLeaders(tickerDataForScan);
    await notify('Task 2', 'complete', 25, `Found ${universe.count} liquid leaders from ${dailyScanResults.length} scanned`);

    // Build rsData map from daily scan results for later use
    const rsData = new Map<string, RSData>();
    for (const stock of dailyScanResults) {
      rsData.set(stock.ticker, { ticker: stock.ticker, rs: stock.rs, perf3m: 0, perf6m: 0 });
    }

    // >>> PERSIST: Cache universe to Supabase (non-blocking)
    saveUniverseCache(universe, today).catch(e => console.error('[Pipeline] Universe cache error:', e));

    // ─────────────────────────────────────────────────────────────────────────
    // Task 3: Pullback Scan (cached 1 hour)
    // Universe data already fetched in Task 2, just need structure/OHLC data
    // ─────────────────────────────────────────────────────────────────────────
    await notify('Task 3', 'starting', 25, 'Analyzing pullback structures...');

    let structureData: Map<string, StructureAnalysis>;

    if (isCacheValid(pipelineCache.structureData)) {
      structureData = pipelineCache.structureData!.data;
      console.log('[Pipeline] Task 3: Using cached structure data');
    } else {
      structureData = new Map();

      const BATCH_SIZE = 5;
      const leaders = universe.leaders ?? [];

      for (let i = 0; i < leaders.length; i += BATCH_SIZE) {
        const batch = leaders.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (leader) => {
          // Only fetch OHLC - universe data already fetched in Task 2
          const ohlc = await fetchOHLCData(leader.ticker, 60);
          const structure = analyzeTickerStructure(leader.ticker, ohlc);
          return { ticker: leader.ticker, structure };
        });

        const batchResults = await Promise.all(batchPromises);
        for (const { ticker, structure } of batchResults) {
          if (structure) structureData.set(ticker, structure);
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
    }

    // Build pullback candidates from real structure data
    const pullbackCandidates: PullbackTickerData[] = [];
    const structureDataArray = Array.from(structureData.entries());
    for (const [ticker, structure] of structureDataArray) {
      const rs = rsData.get(ticker);
      const univItem = universeItemData.get(ticker);
      if (!rs) continue;

      // Apply pullback filters (dist_50 filter removed to maximize candidates)
      if (structure.dist_21ema_atr < PULLBACK_CRITERIA.min_dist_21_atr) continue;
      if (structure.dist_21ema_atr > PULLBACK_CRITERIA.max_dist_21_atr) continue;
      if (structure.weekly_return_pct > PULLBACK_CRITERIA.max_weekly_return_pct) continue;
      // PASSED all filters

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
        // Advancing EMA fields from universe data API
        is_21ema_advancing: univItem?.is21EmaAdvancing,
        is_10wma_advancing: univItem?.is10WmaAdvancing,
      });
    }

    const pullbacks = scanPullbackCandidates(pullbackCandidates);
    await notify('Task 3', 'complete', 50, `Found ${pullbacks.count} pullback candidates`);

    // Enrich universe leaders with calculated structure data + backtest-style scoring
    if (universe.leaders) {
      for (const leader of universe.leaders) {
        const structure = structureData.get(leader.ticker);
        const univItem = universeItemData.get(leader.ticker);
        if (structure) {
          leader.price = structure.close;
          leader.dist_21ema_atr = structure.dist_21ema_atr;
          leader.ema21_close = structure.ema21_close;
          leader.ema21_low = structure.ema21_low;
          leader.ema50_close = structure.ema50_close;
          leader.atr14 = structure.atr14;
          leader.dist_50ema_atr = structure.dist_50ema_atr;
          leader.structure_position = structure.structure_position;
          leader.structure_intact = structure.structure_intact;
          leader.weekly_return_pct = structure.weekly_return_pct;
          leader.close_range_pct = structure.close_range_pct;
          leader.is_contracting = structure.is_contracting;

          // Calculate Grade (A/B/C) based on backtest logic
          const distAbs = Math.abs(structure.dist_21ema_atr);
          if (distAbs <= 0.3 && structure.is_contracting && structure.close_range_pct >= 60 && structure.structure_intact) {
            leader.grade = 'A';
          } else if (distAbs <= 0.7 && structure.close_range_pct >= 40 && structure.structure_intact) {
            leader.grade = 'B';
          } else {
            leader.grade = 'C';
          }

          // Calculate Mode (MODE1/MODE2) based on backtest logic
          const priceAboveStructure = structure.close > structure.ema21_close;
          if (priceAboveStructure && structure.dist_21ema_atr >= 0 && structure.dist_21ema_atr <= 0.5) {
            leader.mode = 'MODE2'; // Reclaim & backtest
          } else {
            leader.mode = 'MODE1'; // Weakness into structure
          }

          // Setup type description
          leader.setup_type = leader.mode === 'MODE2' ? 'reclaim & backtest' : 'weakness into structure';
          if (structure.is_contracting) leader.setup_type += ' + contraction';

          // Calculate Score using backtest weights
          const gradeScore = leader.grade === 'A' ? 30 : leader.grade === 'B' ? 20 : 10;
          const distScore = distAbs <= 0.5 ? 25 : distAbs <= 1.0 ? 15 : 5;
          const modeScore = leader.mode === 'MODE2' ? 15 : 10;
          const contractionScore = structure.is_contracting ? 10 : 0;
          const rsScore = leader.rs >= 90 ? 10 : leader.rs >= 80 ? 7 : 4;
          leader.score = gradeScore + distScore + modeScore + contractionScore + rsScore;
        }
        if (univItem) {
          leader.adr_pct = univItem.adrPct;
          leader.liquidity_m = univItem.liquidityM;
        }
      }

      // Sort leaders by score (highest first)
      universe.leaders.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      // Re-assign ranks after sorting
      universe.leaders.forEach((leader, idx) => { leader.rank = idx + 1; });
    }

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

    // Use all pullback candidates for focus list ranking (not just ready ones)
    const focusInput: FocusListTickerData[] = readiness.rows.map((r, i) => {
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
        price: structure?.close ?? 0,
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
        // Backtest-style scoring fields from focus list
        score: c.score,
        rs: c.rs,
        close_range_pct: c.close_range_pct,
        is_contracting: c.is_contracting,
      };
    });

    const portfolioContext: PortfolioContext = { equity: mockAccount.equity };
    const defaultPermissions: MarketPermissions = {
      new_entries: 'YES',
      adds: true,
      pressing: false,
      trims: true,
    };
    // Pass full market state for multiplier calculation
    const marketContext: MarketContext = {
      permissions: marketState.permissions ?? defaultPermissions,
      marketState: marketState,  // NEW: Pass market state for breadth multiplier
    };
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

    // For ADD trades, update the existing position with more shares
    if (trade.action_type === 'ADD' && trade.side === 'BUY') {
      try {
        const position = await getPositionByTicker(trade.ticker);
        if (position) {
          // Calculate new weighted average price
          const totalShares = position.shares + trade.shares;
          const totalCost = (position.shares * position.avg_price) + (trade.shares * trade.price);
          const newAvgPrice = totalCost / totalShares;

          await updatePosition(trade.ticker, {
            shares: totalShares,
            avg_price: newAvgPrice,
            // Update SSL if provided, otherwise keep existing
            ssl: trade.ssl ?? position.ssl,
            // Recalculate 2R target based on new avg price and SSL
            trim_2r_price: trade.trim_2r_price ?? (trade.ssl ? newAvgPrice + 2 * (newAvgPrice - trade.ssl) : position.trim_2r_price),
          });
          console.log(`[Pipeline] Position updated for ${trade.ticker}: ${totalShares} shares @ $${newAvgPrice.toFixed(2)} avg`);
        } else {
          console.warn(`[Pipeline] ADD trade but no existing position for ${trade.ticker}`);
        }
      } catch (posError) {
        console.error(`[Pipeline] Failed to update position for ${trade.ticker}:`, posError);
        // Don't fail the trade save if position update fails
      }
    }

    // For TRIM/EXIT trades, update/delete the position
    if ((trade.action_type === 'TRIM' || trade.action_type === 'EXIT') && trade.side === 'SELL') {
      try {
        const position = await getPositionByTicker(trade.ticker);
        if (position) {
          const newShares = position.shares - trade.shares;

          if (newShares <= 0 || trade.action_type === 'EXIT') {
            // Full exit - delete position
            await deletePosition(trade.ticker);
            console.log(`[Pipeline] Position deleted for ${trade.ticker} (full exit)`);
          } else {
            // Partial trim - update position
            // Calculate new trimmed percentage based on original shares
            // Original shares = current shares + already trimmed shares
            const alreadyTrimmedShares = (position.trimmed_pct / 100) * position.shares / (1 - position.trimmed_pct / 100);
            const originalShares = position.shares + alreadyTrimmedShares;
            const newTrimmedPct = originalShares > 0
              ? ((originalShares - newShares) / originalShares) * 100
              : position.trimmed_pct;

            // Calculate P&L from the trim
            const trimPnl = (trade.price - position.avg_price) * trade.shares;

            // Determine new status based on trimmed percentage
            const newStatus = newTrimmedPct >= 33 ? 'RUNNER' : position.status;

            await updatePosition(trade.ticker, {
              shares: newShares,
              trimmed_pct: Math.min(100, newTrimmedPct),
              secured_pnl: (position.secured_pnl ?? 0) + trimPnl,
              status: newStatus,
            });
            console.log(`[Pipeline] Position updated for ${trade.ticker}: ${newShares} shares, ${newTrimmedPct.toFixed(1)}% trimmed`);
          }
        } else {
          console.warn(`[Pipeline] Position not found for ${trade.ticker}, cannot update`);
        }
      } catch (posError) {
        console.error(`[Pipeline] Failed to update position for ${trade.ticker}:`, posError);
        // Don't fail the trade save if position update fails
      }
    }

    return savedTrade;
  } catch (error) {
    console.error('[Pipeline] Failed to save trade:', error);
    return null;
  }
}

/**
 * Refresh only the portfolio data from database
 * Used after trim/sell operations to update the UI without re-running the full pipeline
 *
 * @param equity - Account equity for calculations
 * @param cash - Account cash for calculations
 * @returns Updated PortfolioOutput
 */
export async function refreshPortfolioOnly(equity: number = 100000, cash: number = 50000): Promise<PortfolioOutput> {
  const mockAccount: AccountContext = { equity, cash };

  const positions = await loadPositionsFromDatabase();
  const recentTrades = await loadRecentTradesFromDatabase();
  const portfolio = calculatePortfolio(positions, recentTrades, mockAccount);

  console.log(`[Pipeline] Portfolio refreshed: ${positions.length} positions`);

  return portfolio;
}
