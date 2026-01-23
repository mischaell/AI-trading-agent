/**
 * Task 7 — Execution Instructions (Advisory Tickets)
 * Generates order tickets for entry, profit-taking, and stops.
 * @see agent_tasks.md Task 7
 * @see agent_skeleton_v1.0.md Section 4-5 (Stop & Exit, Profit-Taking)
 */

/** Order type for entries */
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT';

/** Time in force for orders */
export type TimeInForce = 'DAY' | 'GTC' | 'IOC';

/**
 * Entry order instructions
 */
export interface EntryOrder {
  /** Order type */
  order_type: OrderType;
  /** Number of shares */
  shares: number;
  /** Time in force */
  tif: TimeInForce;
  /** Limit price (only for LIMIT/STOP_LIMIT orders) */
  limit_price?: number;
}

/**
 * 2R trim order instructions
 * Sell 1/3 of position at 2R price target.
 */
export interface Trim2ROrder {
  /** Number of shares to trim (1/3 of position) */
  shares: number;
  /** Price target for 2R */
  price: number;
}

/**
 * Profit-taking instructions
 */
export interface ProfitInstructions {
  /** 2R trim order */
  trim_2r: Trim2ROrder;
}

/**
 * Stop loss instructions
 * Stop is close-based: daily close < SSL triggers exit at close.
 */
export interface StopInstructions {
  /** Structural stop loss price (21EMA low band) */
  ssl: number;
  /** Human-readable stop rule */
  rule: string;
}

/**
 * Task 7 output payload (per ticker)
 * Advisory order ticket for execution.
 */
export interface ExecutionPlanOutput {
  task: 'execution_plan';
  /** Stock ticker symbol */
  ticker: string;
  /** Entry order instructions */
  entry: EntryOrder;
  /** Profit-taking instructions */
  profit: ProfitInstructions;
  /** Stop loss instructions */
  stop: StopInstructions;
}

/**
 * Batch execution plan for multiple tickers
 */
export interface ExecutionPlanBatchOutput {
  task: 'execution_plan_batch';
  /** Individual execution plans */
  plans: ExecutionPlanOutput[];
}
