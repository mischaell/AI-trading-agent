-- =============================================================================
-- Trading Agent Database Schema
-- Supabase PostgreSQL
--
-- Run this in the Supabase SQL Editor to create all tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. POSITIONS TABLE (Current Holdings)
-- Maps to: PortfolioPosition type
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core position data
  ticker VARCHAR(10) NOT NULL,
  theme VARCHAR(50),
  shares INTEGER NOT NULL CHECK (shares > 0),
  avg_price DECIMAL(12,4) NOT NULL CHECK (avg_price > 0),
  entry_date DATE NOT NULL,

  -- Risk management
  ssl DECIMAL(12,4) NOT NULL CHECK (ssl > 0),
  trim_2r_price DECIMAL(12,4) CHECK (trim_2r_price > 0),

  -- Position state
  trimmed_pct DECIMAL(5,2) DEFAULT 0 CHECK (trimmed_pct >= 0 AND trimmed_pct <= 100),
  secured_pnl DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(10) DEFAULT 'STARTER' CHECK (status IN ('STARTER', 'CORE', 'RUNNER')),

  -- Entry metadata
  mode VARCHAR(5) NOT NULL CHECK (mode IN ('MODE1', 'MODE2')),
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(ticker)
);

-- Indexes for positions
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_ticker ON positions(ticker);

-- -----------------------------------------------------------------------------
-- 2. TRADES TABLE (Execution History)
-- Maps to: TradeRecord type
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trade identification
  ticker VARCHAR(10) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  action_type VARCHAR(5) NOT NULL CHECK (action_type IN ('ENTRY', 'ADD', 'TRIM', 'EXIT')),

  -- Execution details
  shares INTEGER NOT NULL CHECK (shares > 0),
  price DECIMAL(12,4) NOT NULL CHECK (price > 0),

  -- Trade context
  r_multiple DECIMAL(6,2),
  mode VARCHAR(5) CHECK (mode IN ('MODE1', 'MODE2')),
  notes TEXT,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for trades
CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_trades_executed_at ON trades(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_action_type ON trades(action_type);

-- -----------------------------------------------------------------------------
-- 3. MARKET_SNAPSHOTS TABLE (Daily Market State Cache)
-- Maps to: MarketStateOutput type
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Snapshot date (one per day)
  snapshot_date DATE NOT NULL,

  -- QQQE structure
  qqqe_close DECIMAL(12,4),
  qqqe_structure_position VARCHAR(15) NOT NULL
    CHECK (qqqe_structure_position IN ('above_cloud', 'inside_cloud', 'below_cloud')),
  qqqe_structure_slope VARCHAR(10) NOT NULL
    CHECK (qqqe_structure_slope IN ('rising', 'flat', 'falling')),

  -- McClellan breadth indicators
  mco_z DECIMAL(6,2) NOT NULL,
  mcsi_z DECIMAL(6,2) NOT NULL,
  mcsi_slope VARCHAR(12) NOT NULL
    CHECK (mcsi_slope IN ('curling_up', 'curling_down')),
  mcsi_vs_10dma VARCHAR(5) NOT NULL
    CHECK (mcsi_vs_10dma IN ('above', 'below')),

  -- Market state determination
  market_state VARCHAR(25) NOT NULL CHECK (market_state IN (
    'EARLY_CONFIRMATION',
    'CONFIRMED_UPTREND',
    'PARTICIPATION_FADE',
    'BREAKDOWN',
    'WASHOUT'
  )),

  -- Permissions (JSONB)
  permissions JSONB NOT NULL DEFAULT '{
    "new_entries": "NO",
    "adds": false,
    "pressing": false,
    "trims": true
  }'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(snapshot_date)
);

-- Index for market_snapshots
CREATE INDEX IF NOT EXISTS idx_market_snapshots_date ON market_snapshots(snapshot_date DESC);

-- -----------------------------------------------------------------------------
-- 4. UNIVERSE_CACHE TABLE (Liquid Leaders Cache)
-- Maps to: UniverseScanOutput type
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS universe_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache date (one per day)
  cache_date DATE NOT NULL,

  -- Universe data
  tickers JSONB NOT NULL,
  leaders JSONB,
  count INTEGER NOT NULL CHECK (count >= 0),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(cache_date)
);

-- Index for universe_cache
CREATE INDEX IF NOT EXISTS idx_universe_cache_date ON universe_cache(cache_date DESC);

-- -----------------------------------------------------------------------------
-- 5. FOCUS_LIST_CACHE TABLE (Daily Focus List)
-- Maps to: FocusListOutput type
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS focus_list_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache date (one per day)
  cache_date DATE NOT NULL,

  -- Focus list data
  top5 JSONB NOT NULL,
  manual_promotion JSONB DEFAULT '{
    "used": false,
    "ticker": null,
    "reason": null
  }'::jsonb,
  candidates JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(cache_date)
);

-- Index for focus_list_cache
CREATE INDEX IF NOT EXISTS idx_focus_list_cache_date ON focus_list_cache(cache_date DESC);

-- -----------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- -----------------------------------------------------------------------------

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for positions table (drop first if exists)
DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_list_cache ENABLE ROW LEVEL SECURITY;

-- Policies for anon/authenticated access (adjust as needed)
-- Using permissive policies for development - tighten for production

DROP POLICY IF EXISTS "Allow all for anon" ON positions;
CREATE POLICY "Allow all for anon" ON positions
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON trades;
CREATE POLICY "Allow all for anon" ON trades
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON market_snapshots;
CREATE POLICY "Allow all for anon" ON market_snapshots
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON universe_cache;
CREATE POLICY "Allow all for anon" ON universe_cache
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON focus_list_cache;
CREATE POLICY "Allow all for anon" ON focus_list_cache
  FOR ALL TO anon USING (true) WITH CHECK (true);
