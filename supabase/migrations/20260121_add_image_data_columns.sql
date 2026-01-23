-- Add columns for image-extracted data from newsletter
-- Run this migration in Supabase SQL Editor

-- McClellan Analysis data (extracted from dashboard image)
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS mcsi_nasdaq_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mcsi_sp500_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mcsi_nyse_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mcsi_russell_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mco_nasdaq_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mco_sp500_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mco_nyse_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mco_russell_zscore DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS breadth_consensus TEXT;

-- Full McClellan data as JSONB for detailed access
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS mcclellan_data JSONB;

-- Sectors & Themes data (extracted from dashboard image)
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS top_themes JSONB,
ADD COLUMN IF NOT EXISTS top_sectors JSONB;

-- Chart analysis results
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS chart_analysis JSONB;

-- Image analysis metadata
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS images_analyzed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_analysis_notes TEXT[];

-- Add comments for documentation
COMMENT ON COLUMN daily_reports.mcsi_nasdaq_zscore IS 'MCSI Z-Score for Nasdaq 100 (from image)';
COMMENT ON COLUMN daily_reports.mco_nasdaq_zscore IS 'MCO Z-Score for Nasdaq 100 (from image)';
COMMENT ON COLUMN daily_reports.breadth_consensus IS 'Breadth Consensus text (e.g., "Mostly Bullish")';
COMMENT ON COLUMN daily_reports.mcclellan_data IS 'Full McClellan data as JSON';
COMMENT ON COLUMN daily_reports.top_themes IS 'Top 10 themes with leaders and setting up stocks';
COMMENT ON COLUMN daily_reports.top_sectors IS 'Top 10 sectors with leaders and setting up stocks';
COMMENT ON COLUMN daily_reports.chart_analysis IS 'Chart analysis results (position, structure, etc.)';
COMMENT ON COLUMN daily_reports.images_analyzed IS 'Number of images analyzed from email';
