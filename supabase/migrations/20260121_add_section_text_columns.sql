-- Add text columns for parsed report sections
-- Run this migration in Supabase SQL Editor

-- Market Analysis section texts
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS market_analysis_text TEXT,
ADD COLUMN IF NOT EXISTS price_qqqe_text TEXT;

-- Breadth section text
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS breadth_text TEXT;

-- 360° Market View text
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS market_view_text TEXT;

-- Market Internals section texts
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS credit_spreads_text TEXT,
ADD COLUMN IF NOT EXISTS btc_text TEXT;

-- Add comments for documentation
COMMENT ON COLUMN daily_reports.market_analysis_text IS 'Full text from MARKET ANALYSIS section';
COMMENT ON COLUMN daily_reports.price_qqqe_text IS 'Full text from PRICE QQQE section';
COMMENT ON COLUMN daily_reports.breadth_text IS 'Full text from BREADTH (MCSI/MCO) section';
COMMENT ON COLUMN daily_reports.market_view_text IS 'Full text from 360° MARKET VIEW section';
COMMENT ON COLUMN daily_reports.credit_spreads_text IS 'Full text from Credit Spreads (SHY/HYG) section';
COMMENT ON COLUMN daily_reports.btc_text IS 'Full text from #BTC (Bitcoin) section';
