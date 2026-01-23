/**
 * Types for Daily Trading Reports
 *
 * These types map to the daily_reports Supabase table.
 *
 * @see src/lib/gmail/report-parser.ts for parsing logic
 */

// =============================================================================
// Database Types
// =============================================================================

export interface DailyReport {
  id: string;
  report_date: string; // DATE in YYYY-MM-DD format
  email_id: string | null;
  raw_content: string | null;

  // Market Analysis
  qqqe_position: "above" | "below" | "inside" | null;
  qqqe_structure_slope: "rising" | "flat" | "declining" | null;
  market_action: string | null;
  market_analysis_text: string | null;
  price_qqqe_text: string | null;

  // Breadth Data
  mcsi_reading: number | null;
  mcsi_vs_10dma: "above" | "below" | null;
  mcsi_10dma_slope: "rising" | "flat" | "declining" | null;
  mcsi_slope: "turning_up" | "turning_down" | "flat" | null;
  mco_reading: number | null;
  mco_zscore: number | null;
  mco_status: "oversold" | "neutral" | "overbought" | null;
  breadth_text: string | null;

  // TLMM Signal
  tlmm_signal: string | null;
  tlmm_since_date: string | null; // DATE
  market_view_text: string | null;

  // Market Internals
  credit_spreads_signal: string | null;
  credit_spreads_text: string | null;
  btc_signal: string | null;
  btc_text: string | null;

  // Liquid Leaders
  universe_tickers: string[] | null; // JSONB array
  universe_count: number | null;
  pullback_candidates: string[] | null; // JSONB array
  pullback_count: number | null;

  // Image-extracted McClellan Data
  mcsi_nasdaq_zscore: number | null;
  mcsi_sp500_zscore: number | null;
  mcsi_nyse_zscore: number | null;
  mcsi_russell_zscore: number | null;
  mco_nasdaq_zscore: number | null;
  mco_sp500_zscore: number | null;
  mco_nyse_zscore: number | null;
  mco_russell_zscore: number | null;
  breadth_consensus: string | null;
  mcclellan_data: Record<string, unknown> | null; // JSONB

  // Image-extracted Sectors & Themes
  top_themes: Record<string, unknown>[] | null; // JSONB
  top_sectors: Record<string, unknown>[] | null; // JSONB

  // Image-extracted Chart Analysis
  chart_analysis: Record<string, unknown>[] | null; // JSONB

  // Image Analysis Metadata
  images_analyzed: number | null;
  image_analysis_notes: string[] | null;

  // Metadata
  parsing_confidence: number | null;
  parsing_notes: string[] | null; // JSONB array
  parsed_at: string; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
}

// =============================================================================
// Insert/Update Types
// =============================================================================

export interface DailyReportInsert {
  report_date: string;
  email_id?: string;
  raw_content?: string;

  qqqe_position?: "above" | "below" | "inside";
  qqqe_structure_slope?: "rising" | "flat" | "declining";
  market_action?: string;
  market_analysis_text?: string;
  price_qqqe_text?: string;

  mcsi_reading?: number;
  mcsi_vs_10dma?: "above" | "below";
  mcsi_10dma_slope?: "rising" | "flat" | "declining";
  mcsi_slope?: "turning_up" | "turning_down" | "flat";
  mco_reading?: number;
  mco_zscore?: number;
  mco_status?: "oversold" | "neutral" | "overbought";
  breadth_text?: string;

  tlmm_signal?: string;
  tlmm_since_date?: string;
  market_view_text?: string;

  credit_spreads_signal?: string;
  credit_spreads_text?: string;
  btc_signal?: string;
  btc_text?: string;

  universe_tickers?: string[];
  universe_count?: number;
  pullback_candidates?: string[];
  pullback_count?: number;

  // Image-extracted data
  mcsi_nasdaq_zscore?: number;
  mcsi_sp500_zscore?: number;
  mcsi_nyse_zscore?: number;
  mcsi_russell_zscore?: number;
  mco_nasdaq_zscore?: number;
  mco_sp500_zscore?: number;
  mco_nyse_zscore?: number;
  mco_russell_zscore?: number;
  breadth_consensus?: string;
  mcclellan_data?: Record<string, unknown>;
  top_themes?: Record<string, unknown>[];
  top_sectors?: Record<string, unknown>[];
  chart_analysis?: Record<string, unknown>[];
  images_analyzed?: number;
  image_analysis_notes?: string[];

  parsing_confidence?: number;
  parsing_notes?: string[];
}

// =============================================================================
// Query Result Types
// =============================================================================

export interface DailyReportSummary {
  report_date: string;
  qqqe_position: "above" | "below" | "inside" | null;
  mcsi_reading: number | null;
  mco_reading: number | null;
  tlmm_signal: string | null;
  universe_count: number | null;
  pullback_count: number | null;
}

// =============================================================================
// Gmail Token Types (for OAuth storage)
// =============================================================================

export interface GmailToken {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  created_at: string;
  updated_at: string;
}

export interface GmailTokenInsert {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
}
