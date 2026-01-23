/**
 * Supabase Database Types
 *
 * TypeScript types matching the database schema.
 * These provide type safety for all database operations.
 */

// =============================================================================
// Database Row Types
// =============================================================================

export interface PositionRow {
  id: string;
  ticker: string;
  theme: string | null;
  shares: number;
  avg_price: number;
  entry_date: string;
  ssl: number;
  trim_2r_price: number | null;
  trimmed_pct: number;
  secured_pnl: number;
  status: 'STARTER' | 'CORE' | 'RUNNER';
  mode: 'MODE1' | 'MODE2';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeRow {
  id: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  action_type: 'ENTRY' | 'ADD' | 'TRIM' | 'EXIT';
  shares: number;
  price: number;
  r_multiple: number | null;
  mode: 'MODE1' | 'MODE2' | null;
  notes: string | null;
  executed_at: string;
  created_at: string;
}

export interface MarketSnapshotRow {
  id: string;
  snapshot_date: string;
  qqqe_close: number | null;
  qqqe_structure_position: 'above_cloud' | 'inside_cloud' | 'below_cloud';
  qqqe_structure_slope: 'rising' | 'flat' | 'falling';
  mco_z: number;
  mcsi_z: number;
  mcsi_slope: 'curling_up' | 'curling_down';
  mcsi_vs_10dma: 'above' | 'below';
  market_state: 'EARLY_CONFIRMATION' | 'CONFIRMED_UPTREND' | 'PARTICIPATION_FADE' | 'BREAKDOWN' | 'WASHOUT';
  permissions: {
    new_entries: 'YES' | 'LIMITED' | 'NO';
    adds: boolean;
    pressing: boolean;
    trims: boolean;
  };
  created_at: string;
}

export interface UniverseCacheRow {
  id: string;
  cache_date: string;
  tickers: string[];
  leaders: unknown[] | null;
  count: number;
  created_at: string;
}

export interface FocusListCacheRow {
  id: string;
  cache_date: string;
  top5: string[];
  manual_promotion: {
    used: boolean;
    ticker: string | null;
    reason: string | null;
  };
  candidates: unknown[] | null;
  created_at: string;
}

// =============================================================================
// Insert Types (omit auto-generated fields)
// =============================================================================

export type PositionInsert = Omit<PositionRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type TradeInsert = Omit<TradeRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type MarketSnapshotInsert = Omit<MarketSnapshotRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type UniverseCacheInsert = Omit<UniverseCacheRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type FocusListCacheInsert = Omit<FocusListCacheRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

// =============================================================================
// Update Types (all fields optional except id)
// =============================================================================

export type PositionUpdate = Partial<Omit<PositionRow, 'id' | 'created_at'>>;
export type TradeUpdate = Partial<Omit<TradeRow, 'id' | 'created_at'>>;
export type MarketSnapshotUpdate = Partial<Omit<MarketSnapshotRow, 'id' | 'created_at'>>;
export type UniverseCacheUpdate = Partial<Omit<UniverseCacheRow, 'id' | 'created_at'>>;
export type FocusListCacheUpdate = Partial<Omit<FocusListCacheRow, 'id' | 'created_at'>>;

// =============================================================================
// Database Schema Type (for Supabase client)
// =============================================================================

export interface Database {
  public: {
    Tables: {
      positions: {
        Row: PositionRow;
        Insert: PositionInsert;
        Update: PositionUpdate;
      };
      trades: {
        Row: TradeRow;
        Insert: TradeInsert;
        Update: TradeUpdate;
      };
      market_snapshots: {
        Row: MarketSnapshotRow;
        Insert: MarketSnapshotInsert;
        Update: MarketSnapshotUpdate;
      };
      universe_cache: {
        Row: UniverseCacheRow;
        Insert: UniverseCacheInsert;
        Update: UniverseCacheUpdate;
      };
      focus_list_cache: {
        Row: FocusListCacheRow;
        Insert: FocusListCacheInsert;
        Update: FocusListCacheUpdate;
      };
    };
  };
}
