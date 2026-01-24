/**
 * Task 7 — Execution Instructions (Advisory Tickets)
 *
 * Generates advisory order tickets for passed trades from Task 6.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * This is ADVISORY ONLY — no actual execution occurs.
 *
 * Order structure:
 * - Entry: BUY X shares @ MARKET, TIF: DAY
 * - 2R Trim: SELL Y shares (1/3 position) @ LIMIT price, GTC
 * - Stop: daily close < SSL → exit at close (same day)
 *
 * Max pain override: immediate exit if max loss reached intraday.
 *
 * @see agent_tasks.md Task 7
 * @see agent_skeleton_v1.0.md Section 4-5 (Stop & Exit, Profit-Taking)
 */

import Decimal from 'decimal.js';
import {
  ExecutionPlanOutput,
  EntryOrder,
  ProfitInstructions,
  StopInstructions,
  OrderType,
  TimeInForce,
} from '@/types';
import { SizingOutput, SizingBatchOutput, WithholdReason, SizingMultipliers, SizingActionType } from '@/types';
import { EntryMode } from '@/types';

// =============================================================================
// Extended Types (for UI display beyond basic ExecutionPlanOutput)
// =============================================================================

/**
 * Extended execution plan with full context for UI display
 */
export interface ExecutionPlanEntry extends ExecutionPlanOutput {
  /** Entry mode from sizing */
  mode: EntryMode;
  /** Entry price */
  entry_price: number;
  /** R per share (entry - ssl) */
  r_per_share: number;
  /** Position value in dollars */
  position_dollars: number;
  /** Position as percentage of equity */
  position_percent: number;
  /** EC risk as percentage */
  ec_risk_pct: number;
  /** Human-readable stop instruction */
  stop_instruction: string;

  // === NEW: Discord format fields ===

  /** Sizing multipliers used */
  multipliers?: SizingMultipliers;
  /** Action type: NEW_ENTRY or ADD */
  action_type?: SizingActionType;
  /** Discord format line 1: "Long 12% AAPL @ 145.50" */
  discord_format?: string;
  /** Trim fraction: "1/3" */
  trim_fraction?: string;
  /** Target R multiple: 2 */
  trim_target_r?: number;

  // === Backtest-Style Scoring Fields ===

  /** Setup grade: A (perfect), B (good), C (acceptable) */
  grade?: 'A' | 'B' | 'C';
  /** Total score based on backtest weights */
  score?: number;
  /** Relative strength rating (0-99) */
  rs?: number;
  /** Distance to 21EMA in ATR units */
  dist_21ema_atr?: number;
  /** Closing range percentage (0-100) */
  close_range_pct?: number;
  /** Whether price is contracting */
  is_contracting?: boolean;
  /** Setup type description */
  setup_type?: string;
}

/**
 * Discord-formatted trade output
 */
export interface DiscordTradeFormat {
  /** Line 1: "Long 12% AAPL @ 145.50" */
  line1: string;
  /** SSL line: "SSL @ 142.30" */
  ssl: string;
  /** EC Risk line: "EC Risk: -0.85%" */
  ecRisk: string;
  /** Trim line: "Trim: 1/3 at 2R @ 155.20" */
  trim: string;
  /** Full formatted text */
  full: string;
}

/**
 * Withheld trade record
 */
export interface WithheldTrade {
  ticker: string;
  mode: EntryMode;
  reason: WithholdReason;
  detail: string;
}

/**
 * Full execution plan batch with passed and withheld trades
 */
export interface FullExecutionPlanOutput {
  task: 'full_execution_plan';
  /** Passed trades with execution instructions */
  passed: ExecutionPlanEntry[];
  /** Withheld trades with reasons */
  withheld: WithheldTrade[];
  /** Summary totals */
  totals: {
    order_count: number;
    total_dollars: number;
    total_ner_pct: number;
    withheld_count: number;
  };
}

/**
 * Execution plan configuration
 */
export interface ExecutionPlanConfig {
  /** Default order type for entries (default: MARKET) */
  default_order_type?: OrderType;
  /** Time in force for entry orders (default: DAY) */
  entry_tif?: TimeInForce;
  /** Time in force for trim orders (default: GTC) */
  trim_tif?: TimeInForce;
  /** Max pain override percentage (default: 2%) */
  max_pain_pct?: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default execution plan configuration
 */
export const DEFAULT_EXECUTION_CONFIG: Required<ExecutionPlanConfig> = {
  default_order_type: 'MARKET',
  entry_tif: 'DAY',
  trim_tif: 'GTC',
  max_pain_pct: 2.0,
};

// =============================================================================
// Discord Format Helpers (NEW)
// =============================================================================

/**
 * Format a trade in Discord equity-trades format
 *
 * @param entry - Execution plan entry
 * @returns DiscordTradeFormat with all formatted lines
 *
 * @example
 * ```
 * Long 12% GEV @ 661.67
 * SSL @ 617.52
 * EC Risk: -0.88%
 * Trim: 1/3 at 2R @ 749.98
 * ```
 */
export function formatFullDiscordTrade(entry: ExecutionPlanEntry): DiscordTradeFormat {
  const action = entry.action_type === 'ADD' ? 'ADD' : 'Long';
  const pct = Math.round(entry.position_percent);

  const line1 = `${action} ${pct}% ${entry.ticker} @ ${entry.entry_price.toFixed(2)}`;
  const ssl = `SSL @ ${entry.stop.ssl.toFixed(2)}`;
  const ecRisk = `EC Risk: -${entry.ec_risk_pct.toFixed(2)}%`;
  const trim = `Trim: 1/3 at 2R @ ${entry.profit.trim_2r.price.toFixed(2)}`;

  return {
    line1,
    ssl,
    ecRisk,
    trim,
    full: `${line1}\n${ssl}\n${ecRisk}\n${trim}`,
  };
}

/**
 * Format short discord trade line
 */
export function formatShortDiscordTrade(entry: ExecutionPlanEntry): string {
  const action = entry.action_type === 'ADD' ? 'ADD' : 'Long';
  const pct = Math.round(entry.position_percent);
  return `${action} ${pct}% ${entry.ticker} @ ${entry.entry_price.toFixed(2)}`;
}

/**
 * Format execution plan as Discord-style trade list
 */
export function formatDiscordExecutionPlan(plan: FullExecutionPlanOutput): string {
  const lines: string[] = [];

  for (const entry of plan.passed) {
    const trade = formatFullDiscordTrade(entry);
    lines.push(trade.full);
    lines.push(`Shares: ${entry.entry.shares}  |  Position: $${Math.round(entry.position_dollars / 1000) * 1000}`);
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Decimal Helpers
// =============================================================================

/**
 * Convert any numeric input to Decimal
 */
function toDecimal(value: Decimal | number | string): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

// =============================================================================
// Withhold Reason Detail Messages
// =============================================================================

/**
 * Human-readable detail messages for withhold reasons
 */
const WITHHOLD_DETAIL_TEMPLATES: Record<WithholdReason, (sizing: SizingOutput) => string> = {
  regime_forbids_entries: () =>
    'Market regime forbids new entries (permissions.new_entries = NO)',

  ner_exceeds_limit: (sizing) => {
    const maxNer = sizing.mode === 'MODE1' ? 0.25 : 0.50;
    return `NER ${sizing.ec_risk_percent.toFixed(2)}% exceeds ${sizing.mode} limit of ${maxNer.toFixed(2)}%`;
  },

  earnings_too_close: () =>
    'Earnings within 7 days — trade withheld per risk rules',

  exposure_limit_reached: () =>
    'Position would exceed maximum exposure limit',
};

/**
 * Generate withheld trade detail message
 */
export function generateWithholdDetail(sizing: SizingOutput): string {
  if (!sizing.withhold_reason) {
    return 'Unknown withhold reason';
  }

  const template = WITHHOLD_DETAIL_TEMPLATES[sizing.withhold_reason];
  return template(sizing);
}

// =============================================================================
// Stop Instruction Generation
// =============================================================================

/**
 * Generate human-readable stop instruction
 */
function generateStopInstruction(ssl: Decimal): string {
  return `If close < $${ssl.toFixed(2)} → exit at close`;
}

/**
 * Generate stop rule text
 */
function generateStopRule(ssl: Decimal): string {
  return `daily close < $${ssl.toFixed(2)} → exit at close (same day)`;
}

// =============================================================================
// Execution Plan Generation
// =============================================================================

/**
 * Calculate trim shares (1/3 of position, floored)
 */
function calculateTrimShares(totalShares: number): number {
  return Math.floor(totalShares / 3);
}

/**
 * Generate entry order instructions
 */
function generateEntryOrder(
  sizing: SizingOutput,
  config: Required<ExecutionPlanConfig>
): EntryOrder {
  const entryOrder: EntryOrder = {
    order_type: config.default_order_type,
    shares: sizing.shares,
    tif: config.entry_tif,
  };

  // Add limit price for LIMIT orders
  if (config.default_order_type === 'LIMIT') {
    entryOrder.limit_price = sizing.entry;
  }

  return entryOrder;
}

/**
 * Generate profit-taking instructions
 */
function generateProfitInstructions(sizing: SizingOutput): ProfitInstructions {
  const trimShares = calculateTrimShares(sizing.shares);

  return {
    trim_2r: {
      shares: trimShares,
      price: sizing.trim_2r_price,
    },
  };
}

/**
 * Generate stop loss instructions
 */
function generateStopInstructions(sizing: SizingOutput): StopInstructions {
  const ssl = toDecimal(sizing.ssl);

  return {
    ssl: sizing.ssl,
    rule: generateStopRule(ssl),
  };
}

/**
 * Generate execution plan for a single sizing output
 * Returns null if trade is withheld
 */
export function generateSingleExecutionPlan(
  sizing: SizingOutput,
  config?: ExecutionPlanConfig
): ExecutionPlanEntry | null {
  // Skip withheld trades
  if (sizing.gate === 'WITHHOLD') {
    return null;
  }

  const mergedConfig: Required<ExecutionPlanConfig> = {
    ...DEFAULT_EXECUTION_CONFIG,
    ...config,
  };

  const ssl = toDecimal(sizing.ssl);
  const entry = toDecimal(sizing.entry);
  const rPerShare = entry.minus(ssl);

  // Generate order components
  const entryOrder = generateEntryOrder(sizing, mergedConfig);
  const profitInstructions = generateProfitInstructions(sizing);
  const stopInstructions = generateStopInstructions(sizing);

  // Build extended execution plan
  const plan: ExecutionPlanEntry = {
    task: 'execution_plan',
    ticker: sizing.ticker,
    entry: entryOrder,
    profit: profitInstructions,
    stop: stopInstructions,
    // Extended fields for UI
    mode: sizing.mode,
    entry_price: sizing.entry,
    r_per_share: rPerShare.toNumber(),
    position_dollars: sizing.position_dollars,
    position_percent: sizing.position_percent,
    ec_risk_pct: sizing.ec_risk_percent,
    stop_instruction: generateStopInstruction(ssl),
    // NEW: Discord format fields
    multipliers: sizing.multipliers,
    action_type: sizing.action_type || 'NEW_ENTRY',
    discord_format: sizing.discord_format,
    trim_fraction: sizing.trim_fraction || '1/3',
    trim_target_r: sizing.trim_target_r || 2,
    // Backtest-style scoring fields
    grade: sizing.grade,
    score: sizing.score,
    rs: sizing.rs,
    dist_21ema_atr: sizing.dist_21ema_atr,
    close_range_pct: sizing.close_range_pct,
    is_contracting: sizing.is_contracting,
    setup_type: sizing.setup_type,
  };

  return plan;
}

/**
 * Generate withheld trade record
 */
function generateWithheldTrade(sizing: SizingOutput): WithheldTrade {
  return {
    ticker: sizing.ticker,
    mode: sizing.mode,
    reason: sizing.withhold_reason!,
    detail: generateWithholdDetail(sizing),
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 7 — Execution Instructions (Advisory Tickets)
 *
 * Generates advisory order tickets for passed trades and includes
 * withheld trade records with reasons.
 *
 * IMPORTANT: This is ADVISORY ONLY — no actual execution occurs.
 *
 * @param sizingBatch - Output from Task 6 (position sizing)
 * @param config - Execution plan configuration
 * @returns FullExecutionPlanOutput with passed and withheld trades
 *
 * @example
 * ```typescript
 * const executionPlan = generateExecutionPlan(sizingBatch);
 *
 * // Get passed trades
 * executionPlan.passed.forEach(plan => {
 *   console.log(`BUY ${plan.entry.shares} ${plan.ticker} @ ${plan.entry.order_type}`);
 *   console.log(`2R Trim: ${plan.profit.trim_2r.shares} @ $${plan.profit.trim_2r.price}`);
 *   console.log(`Stop: ${plan.stop.rule}`);
 * });
 *
 * // Get withheld trades
 * executionPlan.withheld.forEach(trade => {
 *   console.log(`${trade.ticker} withheld: ${trade.detail}`);
 * });
 * ```
 */
export function generateExecutionPlan(
  sizingBatch: SizingBatchOutput,
  config?: ExecutionPlanConfig
): FullExecutionPlanOutput {
  const mergedConfig: Required<ExecutionPlanConfig> = {
    ...DEFAULT_EXECUTION_CONFIG,
    ...config,
  };

  const passed: ExecutionPlanEntry[] = [];
  const withheld: WithheldTrade[] = [];

  // Process each sizing output
  for (const sizing of sizingBatch.sizing) {
    if (sizing.gate === 'PASS') {
      const plan = generateSingleExecutionPlan(sizing, mergedConfig);
      if (plan) {
        passed.push(plan);
      }
    } else {
      const withheldTrade = generateWithheldTrade(sizing);
      withheld.push(withheldTrade);
    }
  }

  // Calculate totals
  const totalDollars = passed.reduce((acc, p) => acc + p.position_dollars, 0);
  const totalNerPct = passed.reduce((acc, p) => acc + p.ec_risk_pct, 0);

  return {
    task: 'full_execution_plan',
    passed,
    withheld,
    totals: {
      order_count: passed.length,
      total_dollars: totalDollars,
      total_ner_pct: totalNerPct,
      withheld_count: withheld.length,
    },
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all entry orders from execution plan
 */
export function getEntryOrders(plan: FullExecutionPlanOutput): Array<{
  ticker: string;
  order: EntryOrder;
}> {
  return plan.passed.map(p => ({
    ticker: p.ticker,
    order: p.entry,
  }));
}

/**
 * Get all trim orders from execution plan
 */
export function getTrimOrders(plan: FullExecutionPlanOutput): Array<{
  ticker: string;
  shares: number;
  price: number;
}> {
  return plan.passed.map(p => ({
    ticker: p.ticker,
    shares: p.profit.trim_2r.shares,
    price: p.profit.trim_2r.price,
  }));
}

/**
 * Get all stop instructions from execution plan
 */
export function getStopInstructions(plan: FullExecutionPlanOutput): Array<{
  ticker: string;
  ssl: number;
  rule: string;
  instruction: string;
}> {
  return plan.passed.map(p => ({
    ticker: p.ticker,
    ssl: p.stop.ssl,
    rule: p.stop.rule,
    instruction: p.stop_instruction,
  }));
}

/**
 * Check if any trades were withheld
 */
export function hasWithheldTrades(plan: FullExecutionPlanOutput): boolean {
  return plan.withheld.length > 0;
}

/**
 * Get withheld trades by reason
 */
export function getWithheldByReason(
  plan: FullExecutionPlanOutput,
  reason: WithholdReason
): WithheldTrade[] {
  return plan.withheld.filter(w => w.reason === reason);
}

/**
 * Format execution plan as summary text
 * Useful for logging or notifications
 */
export function formatExecutionSummary(plan: FullExecutionPlanOutput): string {
  const lines: string[] = [
    `=== Execution Plan Summary ===`,
    `Orders: ${plan.totals.order_count}`,
    `Total $: $${plan.totals.total_dollars.toLocaleString()}`,
    `Total NER: ${plan.totals.total_ner_pct.toFixed(2)}%`,
    `Withheld: ${plan.totals.withheld_count}`,
    ``,
  ];

  if (plan.passed.length > 0) {
    lines.push(`--- PASSED TRADES ---`);
    for (const p of plan.passed) {
      lines.push(
        `${p.ticker} (${p.mode}): BUY ${p.entry.shares} @ ${p.entry.order_type}, ` +
        `SSL=$${p.stop.ssl.toFixed(2)}, 2R=$${p.profit.trim_2r.price.toFixed(2)}`
      );
    }
    lines.push(``);
  }

  if (plan.withheld.length > 0) {
    lines.push(`--- WITHHELD TRADES ---`);
    for (const w of plan.withheld) {
      lines.push(`${w.ticker} (${w.mode}): ${w.detail}`);
    }
  }

  return lines.join('\n');
}

/**
 * Validate execution plan has required fields
 */
export function validateExecutionPlan(plan: FullExecutionPlanOutput): boolean {
  // Check passed trades have valid data
  for (const p of plan.passed) {
    if (p.entry.shares <= 0) return false;
    if (p.profit.trim_2r.shares <= 0) return false;
    if (p.profit.trim_2r.price <= p.entry_price) return false;
    if (p.stop.ssl >= p.entry_price) return false;
  }

  // Check withheld trades have reasons
  for (const w of plan.withheld) {
    if (!w.reason) return false;
  }

  return true;
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  generateEntryOrder,
  generateProfitInstructions,
  generateStopInstructions,
  generateStopInstruction,
  generateStopRule,
  generateWithheldTrade,
  calculateTrimShares,
  toDecimal,
};
