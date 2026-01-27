-- Daily Scan Cache Table
-- Stores nightly scan results to avoid re-running expensive scans
--
-- The cron job at /api/cron/nightly-scan runs at 2 AM UTC (9 PM ET)
-- and populates this table with the latest liquid leaders.

CREATE TABLE IF NOT EXISTS daily_scan_cache (
  scan_date DATE PRIMARY KEY,
  scan_timestamp TIMESTAMPTZ NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  liquid_leaders JSONB NOT NULL DEFAULT '[]',
  all_passed JSONB NOT NULL DEFAULT '[]',
  elapsed TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_daily_scan_cache_timestamp
ON daily_scan_cache(scan_timestamp DESC);

-- Comment
COMMENT ON TABLE daily_scan_cache IS 'Cache for nightly universe scan results (Liquid Leaders)';
