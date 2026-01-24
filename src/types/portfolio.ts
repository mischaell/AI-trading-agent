/**
 * Task 8 — Portfolio (Create / Update / Display)
 * Manages positions and computes portfolio aggregates.
 * @see agent_tasks.md Task 8
 * @see agent_ui_contract.md Panel 6
 */

/**
 * Position status in portfolio
 */
export type PositionStatus = 'STARTER' | 'CORE' | 'RUNNER';

/**
 * Trade side
 */
export type TradeSide = 'LONG';

/**
 * Portfolio summary aggregates
 */
export interface PortfolioSummary {
  /** Gross exposure as percentage of equity */
  gross_exposure: number;
  /** New Exposure Risk (NER) as percentage */
  ner: number;
  /** Open heat (unrealized P&L) as percentage */
  open_heat: number;
  /** Secured profits (realized from trims) as percentage */
  secured_profits: number;
  /** Total equity in dollars */
  equity?: number;
  /** Cash available in dollars */
  cash?: number;
  /** Number of open positions */
  position_count?: number;
}

/**
 * Individual position in portfolio
 */
export interface PortfolioPosition {
  /** Stock ticker symbol */
  ticker: string;
  /** Trade side (always LONG per invariants) */
  side: TradeSide;
  /** Position weight as percentage of equity */
  weight: number;
  /** Entry price */
  entry: number;
  /** Current structural stop loss (21EMA low band) */
  ssl: number;
  /** Percentage of position trimmed */
  trimmed: number;
  /** Secured P&L from trims as percentage */
  secured_pnl?: number;
  /** Open heat (unrealized P&L) as percentage */
  open_heat?: number;
  /** Current R multiple */
  total_r?: number;
  /** Equity capital risk percentage */
  ec_pct?: number;
  /** Position status */
  status?: PositionStatus;
  /** Current price */
  last_price?: number;
  /** Position value in dollars */
  value?: number;
  /** Number of shares held */
  shares?: number;
  /** Average entry price */
  avg_price?: number;
  /** Days until earnings */
  earnings_days?: number;
  /** Distance to 21EMA in ATR units */
  dist_21_atr?: number;
  /** 2R target price */
  trim_2r_price?: number;
  /** Sector/theme */
  theme?: string;
  /** Entry mode (MODE1 or MODE2) */
  mode?: 'MODE1' | 'MODE2';
  /** Distance from current price to SSL in % */
  ssl_distance_pct?: number;
  /** Whether 2R trim is available */
  trim_available?: boolean;
}

/**
 * Task 8 output payload
 * Contains portfolio summary and all positions.
 */
export interface PortfolioOutput {
  task: 'portfolio';
  /** Portfolio summary aggregates */
  summary: PortfolioSummary;
  /** All open positions */
  positions: PortfolioPosition[];
  /** Timestamp of last update */
  as_of?: string;
}
