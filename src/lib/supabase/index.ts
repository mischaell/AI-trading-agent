/**
 * Supabase Module
 *
 * Re-exports all Supabase utilities for easy importing.
 *
 * @example
 * import { supabase, getPositions, insertTrade } from '@/lib/supabase';
 */

// Client
export { supabase, isSupabaseConfigured } from './client';

// Types
export type {
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

// Queries - Positions
export {
  getPositions,
  getPositionByTicker,
  upsertPosition,
  updatePosition,
  deletePosition,
  getPositionsByStatus,
} from './queries';

// Queries - Trades
export {
  getTrades,
  getRecentTrades,
  insertTrade,
  getTradesByAction,
} from './queries';

// Queries - Market Snapshots
export {
  getLatestMarketSnapshot,
  getMarketSnapshotByDate,
  insertMarketSnapshot,
  getMarketSnapshotHistory,
} from './queries';

// Queries - Universe Cache
export {
  getUniverseCache,
  getUniverseCacheByDate,
  setUniverseCache,
  isUniverseCacheFresh,
} from './queries';

// Queries - Focus List Cache
export {
  getFocusListCache,
  getFocusListCacheByDate,
  setFocusListCache,
  isFocusListCacheFresh,
} from './queries';

// Queries - Daily Scan Cache
export {
  getDailyScanCache,
} from './queries';
export type { DailyScanCacheRow } from './queries';

// Queries - Daily Reports (Newsletter)
export {
  getLatestDailyReport,
} from './queries';
export type { DailyReportRow } from './queries';

// Utilities
export { getTodayDate } from './queries';
