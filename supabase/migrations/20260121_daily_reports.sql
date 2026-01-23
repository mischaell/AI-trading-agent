-- Daily Reports Table Migration
-- Stores parsed trading reports from Gmail import
-- Created: 2026-01-21

-- =============================================================================
-- Gmail OAuth Tokens Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS gmail_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date BIGINT NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user_id ON gmail_tokens(user_id);

-- =============================================================================
-- Daily Reports Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  email_id TEXT,
  raw_content TEXT,

  -- Market Analysis
  qqqe_position TEXT CHECK (qqqe_position IN ('above', 'below', 'inside')),
  qqqe_structure_slope TEXT CHECK (qqqe_structure_slope IN ('rising', 'flat', 'declining')),
  market_action TEXT,

  -- Breadth Data
  mcsi_reading DECIMAL(10,4),
  mcsi_vs_10dma TEXT CHECK (mcsi_vs_10dma IN ('above', 'below')),
  mcsi_10dma_slope TEXT CHECK (mcsi_10dma_slope IN ('rising', 'flat', 'declining')),
  mcsi_slope TEXT CHECK (mcsi_slope IN ('turning_up', 'turning_down', 'flat')),
  mco_reading DECIMAL(10,4),
  mco_zscore DECIMAL(10,4),
  mco_status TEXT CHECK (mco_status IN ('oversold', 'neutral', 'overbought')),

  -- TLMM Signal
  tlmm_signal TEXT,
  tlmm_since_date DATE,

  -- Market Internals
  credit_spreads_signal TEXT,
  btc_signal TEXT,

  -- Liquid Leaders
  universe_tickers JSONB DEFAULT '[]'::jsonb,
  universe_count INTEGER DEFAULT 0,
  pullback_candidates JSONB DEFAULT '[]'::jsonb,
  pullback_count INTEGER DEFAULT 0,

  -- Parsing Metadata
  parsing_confidence DECIMAL(3,2) CHECK (parsing_confidence >= 0 AND parsing_confidence <= 1),
  parsing_notes JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_qqqe_position ON daily_reports(qqqe_position);
CREATE INDEX IF NOT EXISTS idx_daily_reports_tlmm_signal ON daily_reports(tlmm_signal);
CREATE INDEX IF NOT EXISTS idx_daily_reports_mco_status ON daily_reports(mco_status);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

-- Enable RLS
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Gmail tokens: users can only access their own tokens
CREATE POLICY "Users can manage their own gmail tokens"
  ON gmail_tokens
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Daily reports: readable by all authenticated users (shared data)
CREATE POLICY "Authenticated users can read daily reports"
  ON daily_reports
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Daily reports: only admins can insert/update/delete
-- Note: For now, allow service role or authenticated users to insert
CREATE POLICY "Authenticated users can manage daily reports"
  ON daily_reports
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Function to get latest report
CREATE OR REPLACE FUNCTION get_latest_report()
RETURNS daily_reports
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM daily_reports
  ORDER BY report_date DESC
  LIMIT 1;
$$;

-- Function to get reports in date range
CREATE OR REPLACE FUNCTION get_reports_in_range(
  start_date DATE,
  end_date DATE
)
RETURNS SETOF daily_reports
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM daily_reports
  WHERE report_date BETWEEN start_date AND end_date
  ORDER BY report_date DESC;
$$;

-- Function to get reports by market state
CREATE OR REPLACE FUNCTION get_reports_by_qqqe_position(
  position_filter TEXT
)
RETURNS SETOF daily_reports
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM daily_reports
  WHERE qqqe_position = position_filter
  ORDER BY report_date DESC;
$$;

-- =============================================================================
-- Sample Queries (for reference)
-- =============================================================================

-- Get all reports where QQQE is above cloud
-- SELECT * FROM daily_reports WHERE qqqe_position = 'above' ORDER BY report_date DESC;

-- Get reports with oversold MCO
-- SELECT * FROM daily_reports WHERE mco_status = 'oversold' ORDER BY report_date DESC;

-- Get universe tickers from latest report
-- SELECT universe_tickers FROM daily_reports ORDER BY report_date DESC LIMIT 1;

-- Get average MCSI for last 30 days
-- SELECT AVG(mcsi_reading) FROM daily_reports
-- WHERE report_date > CURRENT_DATE - INTERVAL '30 days';

-- Count reports by TLMM signal
-- SELECT tlmm_signal, COUNT(*) FROM daily_reports GROUP BY tlmm_signal;
