/**
 * Task 9 — Overview Navigation + Trades Today
 * Renders navigation and displays trade fills from last 24h.
 * @see agent_tasks.md Task 9
 * @see agent_ui_contract.md Panel 5
 */

/**
 * Trade action type
 */
export type TradeAction = 'BUY' | 'SELL';

/**
 * Trade action subtype for more detail
 */
export type TradeActionType = 'ENTRY' | 'ADD' | 'TRIM' | 'EXIT';

/**
 * Navigation items for the dashboard
 */
export type NavItem =
  | 'Market State'
  | 'Liquid Leaders'
  | 'Pullback Scan'
  | 'Focus List'
  | 'Trades Today'
  | 'Portfolio';

/**
 * Individual trade record from last 24h
 */
export interface TradeRecord {
  /** Time of trade in UTC (HH:MM format) */
  time_utc: string;
  /** Trade action (BUY or SELL) */
  action: TradeAction;
  /** Stock ticker symbol */
  ticker: string;
  /** Number of shares traded */
  shares: number;
  /** Execution price */
  price: number;
  /** Trade notes/reason */
  notes?: string;
  /** Action subtype for more detail */
  action_type?: TradeActionType;
  /** R multiple at time of trade (for trims/exits) */
  r_multiple?: number;
  /** Entry mode (for new entries) */
  mode?: string;
}

/**
 * Task 9 output payload
 * Contains navigation state and trades from last 24h.
 */
export interface OverviewOutput {
  task: 'overview';
  /** Navigation items */
  nav: NavItem[];
  /** Trades from last 24 hours */
  trades_today: TradeRecord[];
}

/**
 * Trade statistics summary
 */
export interface TradeStats {
  /** Total number of trades */
  total: number;
  /** Number of buy trades */
  buys: number;
  /** Number of sell trades */
  sells: number;
  /** Total dollar volume */
  volume?: number;
}
