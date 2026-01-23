/**
 * Historical Data Loader
 *
 * Loads historical data from multiple sources for backtesting:
 * - Newsletter data from Supabase (daily_reports)
 * - Actual trades from Supabase (discord_trades)
 * - Price data from Yahoo Finance
 *
 * @module backtest/data-loader
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import YahooFinance from "yahoo-finance2";
import type {
  DailyContext,
  MarketState,
  MarketPermissions,
  ActualTrade,
  TradeAction,
} from "./types";

// =============================================================================
// Yahoo Finance Instance (v3 API requires class instantiation)
// =============================================================================

const yahooFinance = new YahooFinance();

// =============================================================================
// Types
// =============================================================================

export interface OHLC {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  ticker: string;
  bars: OHLC[];
  latestClose: number;
  ma21High: number;
  ma21Close: number;
  ma21Low: number;
  atr14: number;
  distTo21EMA: number; // In ATR units
}

export interface NewsletterData {
  id: string;
  report_date: string;
  market_analysis_text: string | null;
  price_qqqe_text: string | null;
  breadth_text: string | null;
  market_view_text: string | null;

  qqqe_position: "above" | "below" | "inside" | null;
  qqqe_structure_slope: "rising" | "flat" | "declining" | null;

  mcsi_reading: number | null;
  mcsi_nasdaq_zscore: number | null;
  mco_reading: number | null;
  mco_nasdaq_zscore: number | null;
  breadth_consensus: string | null;

  tlmm_signal: string | null;
  credit_spreads_signal: string | null;
  btc_signal: string | null;

  universe_tickers: string[] | null;
  pullback_candidates: string[] | null;
}

export interface DiscordTradeData {
  id: string;
  trade_date: string;
  action: string;
  side: string;
  ticker: string;
  entry_price: number | null;
  exit_price: number | null;
  position_pct: number | null;
  ssl: number | null;
  ec_risk_pct: number | null;
  gain_pct: number | null;
  r_multiple: number | null;
  trim_fraction: string | null;
  discord_message_id: string;
  raw_message: string;
}

// =============================================================================
// Supabase Client
// =============================================================================

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, key);
}

// =============================================================================
// Newsletter Data Loader
// =============================================================================

/**
 * Load newsletter data for a date range
 */
export async function loadNewsletterData(
  startDate: string,
  endDate: string
): Promise<Map<string, NewsletterData>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("daily_reports")
    .select(`
      id,
      report_date,
      market_analysis_text,
      price_qqqe_text,
      breadth_text,
      market_view_text,
      qqqe_position,
      qqqe_structure_slope,
      mcsi_reading,
      mcsi_nasdaq_zscore,
      mco_reading,
      mco_nasdaq_zscore,
      breadth_consensus,
      tlmm_signal,
      credit_spreads_signal,
      btc_signal,
      universe_tickers,
      pullback_candidates
    `)
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to load newsletter data: ${error.message}`);
  }

  const map = new Map<string, NewsletterData>();
  for (const row of data || []) {
    map.set(row.report_date, row as NewsletterData);
  }

  console.log(`[DataLoader] Loaded ${map.size} newsletter reports`);
  return map;
}

/**
 * Get newsletter data for a specific date
 */
export async function getNewsletterForDate(date: string): Promise<NewsletterData | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("report_date", date)
    .single();

  if (error || !data) {
    return null;
  }

  return data as NewsletterData;
}

// =============================================================================
// Discord Trade Data Loader
// =============================================================================

/**
 * Load Discord trades for a date range
 */
export async function loadDiscordTrades(
  startDate: string,
  endDate: string
): Promise<Map<string, DiscordTradeData[]>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("discord_trades")
    .select("*")
    .gte("trade_date", startDate)
    .lte("trade_date", endDate)
    .order("trade_date", { ascending: true });

  if (error) {
    // Table might not exist yet
    console.warn(`[DataLoader] Discord trades not available: ${error.message}`);
    return new Map();
  }

  const map = new Map<string, DiscordTradeData[]>();
  for (const row of data || []) {
    const date = row.trade_date;
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date)!.push(row as DiscordTradeData);
  }

  const totalTrades = Array.from(map.values()).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[DataLoader] Loaded ${totalTrades} Discord trades across ${map.size} days`);
  return map;
}

/**
 * Get Discord trades for a specific date
 */
export async function getTradesForDate(date: string): Promise<ActualTrade[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("discord_trades")
    .select("*")
    .eq("trade_date", date);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    date: row.trade_date,
    ticker: row.ticker,
    action: row.action as TradeAction,
    side: row.side || "Long",
    entry_price: row.entry_price,
    position_pct: row.position_pct,
    ssl: row.ssl,
    ec_risk_pct: row.ec_risk_pct,
    exit_price: row.exit_price,
    gain_pct: row.gain_pct,
    r_multiple: row.r_multiple,
    trim_fraction: row.trim_fraction,
    recommendation_id: row.suggested_trade_id,
    journal_entry_id: row.journal_entry_id,
    discord_message_id: row.discord_message_id,
    raw_message: row.raw_message,
  }));
}

// =============================================================================
// Yahoo Finance Data Loader
// =============================================================================

/**
 * Fetch OHLC data for a ticker up to a specific date
 */
export async function fetchOHLC(
  ticker: string,
  asOfDate: string,
  lookbackDays: number = 60
): Promise<OHLC[]> {
  const endDate = new Date(asOfDate);
  const startDate = new Date(asOfDate);
  startDate.setDate(startDate.getDate() - lookbackDays);

  try {
    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    const quotes = result?.quotes || [];
    return quotes
      .filter((q) => q.open && q.high && q.low && q.close)
      .map((q) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        open: q.open!,
        high: q.high!,
        low: q.low!,
        close: q.close!,
        volume: q.volume || 0,
      }));
  } catch (error) {
    console.warn(`[DataLoader] Failed to fetch OHLC for ${ticker}: ${error}`);
    return [];
  }
}

/**
 * Calculate 21EMA structure (high, close, low bands)
 */
function calculate21EMAStructure(bars: OHLC[]): {
  maHigh: number;
  maClose: number;
  maLow: number;
} {
  if (bars.length < 21) {
    const last = bars[bars.length - 1];
    return {
      maHigh: last?.high || 0,
      maClose: last?.close || 0,
      maLow: last?.low || 0,
    };
  }

  const period = 21;
  const multiplier = 2 / (period + 1);

  // Calculate EMA for highs
  let emaHigh = bars.slice(0, period).reduce((sum, b) => sum + b.high, 0) / period;
  for (let i = period; i < bars.length; i++) {
    emaHigh = (bars[i].high - emaHigh) * multiplier + emaHigh;
  }

  // Calculate EMA for closes
  let emaClose = bars.slice(0, period).reduce((sum, b) => sum + b.close, 0) / period;
  for (let i = period; i < bars.length; i++) {
    emaClose = (bars[i].close - emaClose) * multiplier + emaClose;
  }

  // Calculate EMA for lows
  let emaLow = bars.slice(0, period).reduce((sum, b) => sum + b.low, 0) / period;
  for (let i = period; i < bars.length; i++) {
    emaLow = (bars[i].low - emaLow) * multiplier + emaLow;
  }

  return {
    maHigh: emaHigh,
    maClose: emaClose,
    maLow: emaLow,
  };
}

/**
 * Calculate 14-period ATR
 */
function calculateATR(bars: OHLC[], period: number = 14): number {
  if (bars.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Simple average for ATR
  const recentTRs = trueRanges.slice(-period);
  return recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;
}

/**
 * Get complete stock data for a ticker as of a specific date
 */
export async function getStockDataAsOf(
  ticker: string,
  asOfDate: string
): Promise<StockData | null> {
  const bars = await fetchOHLC(ticker, asOfDate, 60);

  if (bars.length < 21) {
    console.warn(`[DataLoader] Insufficient data for ${ticker} as of ${asOfDate}`);
    return null;
  }

  // Filter to bars on or before asOfDate
  const filteredBars = bars.filter((b) => b.date <= asOfDate);
  if (filteredBars.length < 21) {
    return null;
  }

  const latestBar = filteredBars[filteredBars.length - 1];
  const structure = calculate21EMAStructure(filteredBars);
  const atr = calculateATR(filteredBars);

  const distTo21EMA = atr > 0
    ? (latestBar.close - structure.maClose) / atr
    : 0;

  return {
    ticker,
    bars: filteredBars,
    latestClose: latestBar.close,
    ma21High: structure.maHigh,
    ma21Close: structure.maClose,
    ma21Low: structure.maLow,
    atr14: atr,
    distTo21EMA,
  };
}

/**
 * Batch fetch stock data for multiple tickers
 */
export async function batchGetStockData(
  tickers: string[],
  asOfDate: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();
  let completed = 0;

  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (ticker) => {
        const data = await getStockDataAsOf(ticker, asOfDate);
        if (data) {
          results.set(ticker, data);
        }
        completed++;
        onProgress?.(completed, tickers.length);
      })
    );

    // Small delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}

// =============================================================================
// Context Builder
// =============================================================================

/**
 * Build DailyContext from newsletter data and QQQE price data
 */
export async function buildDailyContext(
  date: string,
  newsletter: NewsletterData | null
): Promise<DailyContext> {
  // Fetch QQQE data
  const qqqeData = await getStockDataAsOf("QQQE", date);

  // Determine market state from newsletter or calculate
  let marketState: MarketState = "CONFIRMED_UPTREND";
  let permissions: MarketPermissions = {
    new_entries: true,
    adds: true,
    pressing: true,
    trims: true,
  };

  if (newsletter?.tlmm_signal) {
    const signal = newsletter.tlmm_signal.toUpperCase();
    if (signal.includes("CONFIRMED") || signal.includes("UPTREND")) {
      marketState = "CONFIRMED_UPTREND";
    } else if (signal.includes("RALLY")) {
      marketState = "RALLY_ATTEMPT";
      permissions.new_entries = false;
      permissions.pressing = false;
    } else if (signal.includes("PRESSURE")) {
      marketState = "UPTREND_UNDER_PRESSURE";
      permissions.pressing = false;
    } else if (signal.includes("PULLBACK")) {
      marketState = "PULLBACK";
      permissions.new_entries = false;
    } else if (signal.includes("CORRECTION")) {
      marketState = "CORRECTION";
      permissions = { new_entries: false, adds: false, pressing: false, trims: true };
    } else if (signal.includes("DOWNTREND")) {
      marketState = "DOWNTREND";
      permissions = { new_entries: false, adds: false, pressing: false, trims: true };
    }
  }

  // Parse credit spreads and BTC signals
  const parseSignal = (text: string | null): "bullish" | "bearish" | "neutral" | null => {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("bullish") || lower.includes("positive") || lower.includes("supportive")) {
      return "bullish";
    }
    if (lower.includes("bearish") || lower.includes("negative") || lower.includes("warning")) {
      return "bearish";
    }
    return "neutral";
  };

  return {
    date,
    market_state: marketState,
    permissions,

    qqqe_position: newsletter?.qqqe_position || (qqqeData ? determinePosition(qqqeData) : "inside"),
    qqqe_slope: newsletter?.qqqe_structure_slope || "flat",
    qqqe_close: qqqeData?.latestClose || 0,
    qqqe_ma_high: qqqeData?.ma21High || 0,
    qqqe_ma_close: qqqeData?.ma21Close || 0,
    qqqe_ma_low: qqqeData?.ma21Low || 0,

    mcsi_reading: newsletter?.mcsi_reading || null,
    mcsi_zscore: newsletter?.mcsi_nasdaq_zscore || null,
    mco_reading: newsletter?.mco_reading || null,
    mco_zscore: newsletter?.mco_nasdaq_zscore || null,
    breadth_consensus: newsletter?.breadth_consensus || null,

    tlmm_signal: newsletter?.tlmm_signal || null,
    credit_spreads_signal: parseSignal(newsletter?.credit_spreads_signal || null),
    btc_signal: parseSignal(newsletter?.btc_signal || null),

    from_newsletter: newsletter !== null,
    newsletter_id: newsletter?.id || null,
  };
}

/**
 * Determine position relative to 21EMA structure
 */
function determinePosition(data: StockData): "above" | "below" | "inside" {
  const { latestClose, ma21High, ma21Low } = data;

  if (latestClose > ma21High) {
    return "above";
  }
  if (latestClose < ma21Low) {
    return "below";
  }
  return "inside";
}

// =============================================================================
// Main Data Loader Class
// =============================================================================

export class HistoricalDataLoader {
  private newsletterCache: Map<string, NewsletterData> = new Map();
  private tradesCache: Map<string, DiscordTradeData[]> = new Map();
  private stockDataCache: Map<string, StockData> = new Map();

  constructor(
    private startDate: string,
    private endDate: string
  ) {}

  /**
   * Pre-load all data for the date range
   */
  async preload(): Promise<void> {
    console.log(`[HistoricalDataLoader] Preloading data from ${this.startDate} to ${this.endDate}`);

    // Load newsletter data
    this.newsletterCache = await loadNewsletterData(this.startDate, this.endDate);

    // Load Discord trades
    this.tradesCache = await loadDiscordTrades(this.startDate, this.endDate);

    console.log(`[HistoricalDataLoader] Preload complete`);
  }

  /**
   * Get all dates in the backtest range
   */
  getDateRange(): string[] {
    const dates: string[] = [];
    const current = new Date(this.startDate);
    const end = new Date(this.endDate);

    while (current <= end) {
      // Skip weekends
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(current.toISOString().split("T")[0]);
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Get newsletter data for a date (from cache)
   */
  getNewsletter(date: string): NewsletterData | null {
    return this.newsletterCache.get(date) || null;
  }

  /**
   * Get Discord trades for a date (from cache)
   */
  getTrades(date: string): DiscordTradeData[] {
    return this.tradesCache.get(date) || [];
  }

  /**
   * Get ALL Discord trades across the entire date range
   */
  getAllTrades(): DiscordTradeData[] {
    const allTrades: DiscordTradeData[] = [];
    for (const trades of this.tradesCache.values()) {
      allTrades.push(...trades);
    }
    return allTrades;
  }

  /**
   * Get DailyContext for a date
   */
  async getContext(date: string): Promise<DailyContext> {
    const newsletter = this.getNewsletter(date);
    return buildDailyContext(date, newsletter);
  }

  /**
   * Get stock data for a ticker as of a date
   */
  async getStockData(ticker: string, date: string): Promise<StockData | null> {
    const cacheKey = `${ticker}:${date}`;

    if (!this.stockDataCache.has(cacheKey)) {
      const data = await getStockDataAsOf(ticker, date);
      if (data) {
        this.stockDataCache.set(cacheKey, data);
      }
    }

    return this.stockDataCache.get(cacheKey) || null;
  }

  /**
   * Get universe tickers for a date (from newsletter or default)
   * Expanded to include tickers from Discord trades for better matching
   */
  getUniverseTickers(date: string): string[] {
    const newsletter = this.getNewsletter(date);
    const baseTickers = newsletter?.universe_tickers && newsletter.universe_tickers.length > 0
      ? newsletter.universe_tickers
      : NASDAQ_100_TICKERS;

    // Get unique tickers from all Discord trades to expand universe
    const discordTickers = this.getDiscordTickers();

    // Merge and dedupe
    const combined = new Set([...baseTickers, ...discordTickers]);
    return Array.from(combined);
  }

  /**
   * Get all unique tickers from Discord trades
   */
  getDiscordTickers(): string[] {
    const tickers = new Set<string>();
    for (const trades of this.tradesCache.values()) {
      for (const trade of trades) {
        if (trade.ticker) {
          tickers.add(trade.ticker);
        }
      }
    }
    return Array.from(tickers);
  }

  /**
   * Check if a ticker appears in Discord trades
   */
  isDiscordTicker(ticker: string): boolean {
    for (const trades of this.tradesCache.values()) {
      for (const trade of trades) {
        if (trade.ticker === ticker) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get pullback candidates for a date (from newsletter)
   */
  getPullbackCandidates(date: string): string[] {
    const newsletter = this.getNewsletter(date);
    return newsletter?.pullback_candidates || [];
  }
}

// =============================================================================
// Default Universe
// =============================================================================

const NASDAQ_100_TICKERS = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "GOOG", "TSLA", "AVGO", "COST",
  "NFLX", "ADBE", "AMD", "PEP", "CSCO", "TMUS", "INTC", "CMCSA", "INTU", "QCOM",
  "TXN", "AMGN", "AMAT", "ISRG", "HON", "BKNG", "SBUX", "VRTX", "LRCX", "ADI",
  "MU", "GILD", "MDLZ", "ADP", "PANW", "REGN", "KLAC", "SNPS", "CDNS", "MELI",
  "CRWD", "PYPL", "MAR", "ORLY", "ASML", "CTAS", "MNST", "ABNB", "MRVL", "FTNT",
  "KDP", "NXPI", "KHC", "PCAR", "AEP", "DXCM", "MCHP", "LULU", "EXC", "ROST",
  "ODFL", "IDXX", "PAYX", "FAST", "AZN", "EA", "CEG", "CPRT", "WDAY", "CTSH",
  "GEHC", "CSGP", "BKR", "VRSK", "XEL", "FANG", "DDOG", "TEAM", "ZS", "TTWO",
  "ILMN", "ON", "MRNA", "GFS", "ANSS", "CDW", "BIIB", "DLTR", "WBD", "SIRI",
  "LCID", "JD", "PDD", "BIDU", "NTES", "RIVN", "ZM", "ALGN", "ENPH", "SPLK",
];

// =============================================================================
// Exports
// =============================================================================

export default {
  loadNewsletterData,
  loadDiscordTrades,
  getNewsletterForDate,
  getTradesForDate,
  fetchOHLC,
  getStockDataAsOf,
  batchGetStockData,
  buildDailyContext,
  HistoricalDataLoader,
};
