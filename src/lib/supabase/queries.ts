/**
 * Supabase Query Functions
 *
 * Database operations for all tables.
 * All functions return typed data matching the schema.
 */

import { supabase, isSupabaseConfigured } from './client';
import type {
  PositionRow,
  PositionInsert,
  PositionUpdate,
  TradeRow,
  TradeInsert,
  MarketSnapshotRow,
  MarketSnapshotInsert,
  UniverseCacheRow,
  UniverseCacheInsert,
  FocusListCacheRow,
  FocusListCacheInsert,
} from './types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Throw error if Supabase is not configured
 */
function requireSupabase(): void {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set environment variables.');
  }
}

// =============================================================================
// POSITIONS
// =============================================================================

/**
 * Get all open positions
 */
export async function getPositions(): Promise<PositionRow[]> {
  requireSupabase();

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .order('entry_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Get a single position by ticker
 */
export async function getPositionByTicker(ticker: string): Promise<PositionRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('ticker', ticker)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

/**
 * Insert or update a position (upsert by ticker)
 */
export async function upsertPosition(position: PositionInsert): Promise<PositionRow> {
  requireSupabase();

  const { data, error } = await supabase
    .from('positions')
    .upsert(position, { onConflict: 'ticker' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a position by ticker
 */
export async function updatePosition(ticker: string, updates: PositionUpdate): Promise<PositionRow> {
  requireSupabase();

  const { data, error } = await supabase
    .from('positions')
    .update(updates)
    .eq('ticker', ticker)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a position by ticker
 */
export async function deletePosition(ticker: string): Promise<void> {
  requireSupabase();

  const { error } = await supabase
    .from('positions')
    .delete()
    .eq('ticker', ticker);

  if (error) throw error;
}

/**
 * Get positions by status
 */
export async function getPositionsByStatus(
  status: 'STARTER' | 'CORE' | 'RUNNER'
): Promise<PositionRow[]> {
  requireSupabase();

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('status', status);

  if (error) throw error;
  return data ?? [];
}

// =============================================================================
// TRADES
// =============================================================================

/**
 * Get all trades, optionally filtered by date range
 */
export async function getTrades(options?: {
  startDate?: string;
  endDate?: string;
  ticker?: string;
  limit?: number;
}): Promise<TradeRow[]> {
  requireSupabase();

  let query = supabase
    .from('trades')
    .select('*')
    .order('executed_at', { ascending: false });

  if (options?.startDate) {
    query = query.gte('executed_at', options.startDate);
  }
  if (options?.endDate) {
    query = query.lte('executed_at', options.endDate);
  }
  if (options?.ticker) {
    query = query.eq('ticker', options.ticker);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

/**
 * Get trades from the last N hours
 */
export async function getRecentTrades(hours: number = 24): Promise<TradeRow[]> {
  requireSupabase();

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .gte('executed_at', cutoff)
    .order('executed_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Insert a new trade
 */
export async function insertTrade(trade: TradeInsert): Promise<TradeRow> {
  requireSupabase();

  const { data, error } = await supabase
    .from('trades')
    .insert(trade)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get trades by action type
 */
export async function getTradesByAction(
  actionType: 'ENTRY' | 'ADD' | 'TRIM' | 'EXIT'
): Promise<TradeRow[]> {
  requireSupabase();

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('action_type', actionType)
    .order('executed_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// =============================================================================
// MARKET SNAPSHOTS
// =============================================================================

/**
 * Get the latest market snapshot
 */
export async function getLatestMarketSnapshot(): Promise<MarketSnapshotRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('market_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get market snapshot for a specific date
 */
export async function getMarketSnapshotByDate(date: string): Promise<MarketSnapshotRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('market_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Insert a new market snapshot (upserts by date)
 */
export async function insertMarketSnapshot(snapshot: MarketSnapshotInsert): Promise<MarketSnapshotRow> {
  requireSupabase();

  const { data, error } = await supabase
    .from('market_snapshots')
    .upsert(snapshot, { onConflict: 'snapshot_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get market snapshots for a date range
 */
export async function getMarketSnapshotHistory(
  startDate: string,
  endDate: string
): Promise<MarketSnapshotRow[]> {
  requireSupabase();

  const { data, error } = await supabase
    .from('market_snapshots')
    .select('*')
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)
    .order('snapshot_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// =============================================================================
// UNIVERSE CACHE
// =============================================================================

/**
 * Get the latest universe cache
 */
export async function getUniverseCache(): Promise<UniverseCacheRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('universe_cache')
    .select('*')
    .order('cache_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get universe cache for a specific date
 */
export async function getUniverseCacheByDate(date: string): Promise<UniverseCacheRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('universe_cache')
    .select('*')
    .eq('cache_date', date)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Set/update the universe cache for today (upserts by date)
 */
export async function setUniverseCache(cache: UniverseCacheInsert): Promise<UniverseCacheRow> {
  requireSupabase();

  const { data, error } = await supabase
    .from('universe_cache')
    .upsert(cache, { onConflict: 'cache_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Check if universe cache is fresh (from today)
 */
export async function isUniverseCacheFresh(): Promise<boolean> {
  const cache = await getUniverseCache();
  if (!cache) return false;
  return cache.cache_date === getTodayDate();
}

// =============================================================================
// FOCUS LIST CACHE
// =============================================================================

/**
 * Get the latest focus list cache
 */
export async function getFocusListCache(): Promise<FocusListCacheRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('focus_list_cache')
    .select('*')
    .order('cache_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get focus list cache for a specific date
 */
export async function getFocusListCacheByDate(date: string): Promise<FocusListCacheRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('focus_list_cache')
    .select('*')
    .eq('cache_date', date)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Set/update the focus list cache for today (upserts by date)
 */
export async function setFocusListCache(cache: FocusListCacheInsert): Promise<FocusListCacheRow> {
  requireSupabase();

  const { data, error } = await supabase
    .from('focus_list_cache')
    .upsert(cache, { onConflict: 'cache_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Check if focus list cache is fresh (from today)
 */
export async function isFocusListCacheFresh(): Promise<boolean> {
  const cache = await getFocusListCache();
  if (!cache) return false;
  return cache.cache_date === getTodayDate();
}

// =============================================================================
// DAILY SCAN CACHE
// =============================================================================

export interface DailyScanCacheRow {
  scan_date: string;
  scan_timestamp: string;
  stats: Record<string, number>;
  liquid_leaders: Array<{
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
  }>;
  all_passed: Array<{
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
  }>;
  elapsed: string;
  created_at: string;
}

/**
 * Get most recent daily scan cache
 */
export async function getDailyScanCache(): Promise<DailyScanCacheRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('daily_scan_cache')
    .select('*')
    .order('scan_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// =============================================================================
// DAILY REPORTS (Newsletter)
// =============================================================================

export interface DailyReportRow {
  id: string;
  report_date: string;
  universe_tickers: string[] | null;
  pullback_candidates: string[] | null;
  universe_count: number | null;
  pullback_count: number | null;
  created_at: string;
}

/**
 * Get the most recent daily report with universe_tickers populated
 */
export async function getLatestDailyReport(): Promise<DailyReportRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, report_date, universe_tickers, pullback_candidates, universe_count, pullback_count, created_at')
    .not('universe_tickers', 'is', null)
    .order('report_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// =============================================================================
// TOP IDEAS (Discord Gameplan)
// =============================================================================

export interface TopIdeasRow {
  top_ideas: string[];
  post_date: string;
  situational_awareness: string;
  gameplan: string;
}

/**
 * Get the most recent Top Ideas from discord_gameplan
 */
export async function getLatestTopIdeas(): Promise<TopIdeasRow | null> {
  requireSupabase();

  const { data, error } = await supabase
    .from('discord_gameplan')
    .select('top_ideas, post_date, situational_awareness, gameplan')
    .not('top_ideas', 'is', null)
    .order('post_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export { getTodayDate, isSupabaseConfigured };
