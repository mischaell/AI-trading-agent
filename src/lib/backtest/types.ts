/**
 * Backtesting Types
 *
 * Type definitions for the backtesting infrastructure.
 *
 * @module backtest/types
 */

// =============================================================================
// Market Context Types
// =============================================================================

export type MarketState =
  | "CONFIRMED_UPTREND"
  | "RALLY_ATTEMPT"
  | "UPTREND_UNDER_PRESSURE"
  | "PULLBACK"
  | "CORRECTION"
  | "DOWNTREND";

export interface MarketPermissions {
  new_entries: boolean;
  adds: boolean;
  pressing: boolean;
  trims: boolean;
}

export interface DailyContext {
  date: string; // YYYY-MM-DD

  // Market Regime
  market_state: MarketState;
  permissions: MarketPermissions;

  // QQQE Structure
  qqqe_position: "above" | "below" | "inside";
  qqqe_slope: "rising" | "flat" | "declining";
  qqqe_close: number;
  qqqe_ma_high: number;
  qqqe_ma_close: number;
  qqqe_ma_low: number;

  // Breadth
  mcsi_reading: number | null;
  mcsi_zscore: number | null;
  mco_reading: number | null;
  mco_zscore: number | null;
  breadth_consensus: string | null;

  // Signals
  tlmm_signal: string | null;
  credit_spreads_signal: "bullish" | "bearish" | "neutral" | null;
  btc_signal: "bullish" | "bearish" | "neutral" | null;

  // Source
  from_newsletter: boolean;
  newsletter_id: string | null;
}

// =============================================================================
// Candidate & Recommendation Types
// =============================================================================

export type EntryMode = "MODE1" | "MODE2";
export type Grade = "A" | "B" | "C";

export interface Candidate {
  ticker: string;
  date: string;

  // Selection metrics
  rs_rank: number;
  rs_percentile: number;
  grade: Grade;
  mode: EntryMode;

  // Technical setup
  setup_type: string;
  trigger: string | null;
  dist_to_21ema_atr: number;
  contraction: boolean;
  close_in_range_pct: number;

  // Price data
  close: number;
  ma_high: number;
  ma_close: number;
  ma_low: number;
  atr: number;

  // Checks
  earnings_days: number;
  structure_intact: boolean;
  atr_bounds_ok: boolean;
}

export interface TradeRecommendation {
  id: string;
  date: string;
  ticker: string;

  // Selection
  candidate: Candidate;
  focus_rank: number; // 1-5
  score: number; // 0-100

  // Position sizing
  entry_price: number;
  position_pct: number;
  position_dollars: number;
  shares: number;

  // Risk management
  ssl: number; // Soft stop loss (21EMA Low)
  r_per_share: number;
  ner_pct: number; // New equity risk %

  // Exit plan
  trim_shares: number;
  trim_price_2r: number;

  // Gate result
  gate_passed: boolean;
  gate_reason: string | null;

  // Context
  market_state: MarketState;
  daily_context_id: string;
}

// =============================================================================
// Actual Trade Types (from Discord)
// =============================================================================

export type TradeAction = "ENTRY" | "ADD" | "TRIM" | "CLOSE" | "STOP_OUT";

export interface ActualTrade {
  id: string;
  date: string;
  ticker: string;
  action: TradeAction;
  side: "Long" | "Short";

  // Entry details
  entry_price: number | null;
  position_pct: number | null;
  ssl: number | null;
  ec_risk_pct: number | null;

  // Exit details
  exit_price: number | null;
  gain_pct: number | null;
  r_multiple: number | null;
  trim_fraction: string | null;

  // Linking
  recommendation_id: string | null;
  journal_entry_id: string | null;

  // Metadata
  discord_message_id: string;
  raw_message: string;
}

// =============================================================================
// Outcome Types
// =============================================================================

export type ExitReason =
  | "hit_2r"
  | "hit_3r"
  | "stopped_out"
  | "manual_close_profit"
  | "manual_close_loss"
  | "still_open"
  | "no_entry"; // Recommendation was not executed

export interface TradeOutcome {
  recommendation: TradeRecommendation;
  actual_trade: ActualTrade | null;

  // Execution
  was_executed: boolean;
  execution_price_variance: number | null; // (actual - recommended) / recommended
  execution_size_variance: number | null;
  execution_day_diff: number | null; // 0 = same day, 1 = next day

  // Result
  entry_date: string | null;
  exit_date: string | null;
  exit_reason: ExitReason;
  r_achieved: number | null;
  gain_pct: number | null;
  holding_days: number | null;

  // Excursions (from forward simulation)
  mfe_r: number | null; // Max Favorable Excursion in R
  mfe_price: number | null;
  mfe_date: string | null;
  mae_r: number | null; // Max Adverse Excursion in R
  mae_price: number | null;
  mae_date: string | null;

  // If not executed, simulate what would have happened
  simulated_exit_reason: ExitReason | null;
  simulated_r: number | null;
  simulated_holding_days: number | null;
}

// =============================================================================
// Performance Types
// =============================================================================

export interface PerformanceMetrics {
  period_start: string;
  period_end: string;

  // Counts
  total_recommendations: number;
  executed_count: number;
  skipped_count: number;

  // Win/Loss
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number; // 0-1

  // R-Multiples
  total_r: number;
  avg_winner_r: number;
  avg_loser_r: number;
  largest_winner_r: number;
  largest_loser_r: number;

  // Profit metrics
  profit_factor: number; // Gross profit / Gross loss
  expectancy: number; // (WinRate × AvgWin) - (LossRate × AvgLoss)

  // Holding periods
  avg_holding_days: number;
  avg_winner_holding_days: number;
  avg_loser_holding_days: number;

  // Exit analysis
  hit_2r_rate: number; // % that hit 2R target
  stopped_out_rate: number; // % that hit stop
  manual_close_rate: number; // % closed manually

  // Execution quality
  avg_price_variance: number;
  avg_size_variance: number;
  same_day_execution_rate: number;
}

export interface PerformanceByCategory {
  by_mode: Record<EntryMode, PerformanceMetrics>;
  by_grade: Record<Grade, PerformanceMetrics>;
  by_market_state: Record<MarketState, PerformanceMetrics>;
  by_setup_type: Record<string, PerformanceMetrics>;
}

export interface PerformanceComparison {
  agent_recommendations: PerformanceMetrics;
  actual_execution: PerformanceMetrics;
  newsletter_picks: PerformanceMetrics | null;
  random_baseline: PerformanceMetrics | null;
}

// =============================================================================
// Scoring Weight Types
// =============================================================================

export interface ScoringWeights {
  grade: { A: number; B: number; C: number };
  distance: { perfect: number; good: number; acceptable: number };
  mode: { MODE1: number; MODE2: number };
  contraction: number;
  close_range_max: number;
  rs: { high: number; medium: number; low: number };
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  grade: { A: 30, B: 20, C: 10 },
  distance: { perfect: 25, good: 15, acceptable: 5 },
  mode: { MODE1: 10, MODE2: 15 },
  contraction: 10,
  close_range_max: 10,
  rs: { high: 10, medium: 7, low: 4 },
};

// =============================================================================
// Backtest Configuration
// =============================================================================

export interface BacktestConfig {
  start_date: string;
  end_date: string;

  // Portfolio
  initial_equity: number;
  max_positions: number;
  max_sector_concentration: number;

  // Risk limits
  max_portfolio_heat: number; // Total NER %
  max_position_size: number; // Max single position %

  // Scoring weights
  weights: ScoringWeights;

  // Simulation settings
  slippage_bps: number; // Basis points slippage
  commission_per_trade: number;

  // Data sources
  use_newsletter_data: boolean;
  use_discord_data: boolean;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  start_date: "",
  end_date: "",
  initial_equity: 100000,
  max_positions: 8,
  max_sector_concentration: 0.3,
  max_portfolio_heat: 2.0,
  max_position_size: 0.15,
  weights: DEFAULT_SCORING_WEIGHTS,
  slippage_bps: 5,
  commission_per_trade: 0,
  use_newsletter_data: true,
  use_discord_data: true,
};

// =============================================================================
// Backtest Result Types
// =============================================================================

export interface DailyBacktestResult {
  date: string;
  context: DailyContext;
  recommendations: TradeRecommendation[];
  actual_trades: ActualTrade[];
  outcomes: TradeOutcome[];
  // Direct Discord trades (with/without recommendations)
  discord_outcomes: DiscordTradeOutcome[];
}

/**
 * Outcome for a Discord trade (tracked regardless of recommendation match)
 */
export interface DiscordTradeOutcome {
  trade: ActualTrade;

  // Match status
  matched_recommendation: TradeRecommendation | null;
  match_type: "exact" | "fuzzy" | "unmatched";
  match_day_offset: number | null; // 0, 1, 2 for fuzzy matches

  // Outcome (from Discord data or forward simulation)
  exit_date: string | null;
  exit_reason: ExitReason;
  r_achieved: number | null;
  gain_pct: number | null;
  holding_days: number | null;

  // Source of outcome
  outcome_source: "discord" | "simulated";
}

export interface BacktestResult {
  config: BacktestConfig;
  daily_results: DailyBacktestResult[];

  // Aggregated performance
  overall_performance: PerformanceMetrics;
  performance_by_category: PerformanceByCategory;
  comparison: PerformanceComparison;

  // Equity curve
  equity_curve: { date: string; equity: number; drawdown: number }[];
  max_drawdown: number;
  max_drawdown_date: string;

  // Best/Worst
  best_trades: TradeOutcome[];
  worst_trades: TradeOutcome[];

  // Insights
  insights: string[];
}
