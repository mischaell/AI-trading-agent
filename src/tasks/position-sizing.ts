/**
 * Task 6 — Position Sizing & Risk Gate (Agent-led)
 *
 * Calculates position size and applies risk gate for each focus candidate.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Position sizing by mode (from agent_skeleton Section 6):
 * - MODE1: 10-12% of equity, 0.25% NER max
 * - MODE2: 12-15% of equity, 0.50% NER max
 *
 * Risk gate checks:
 * - Market regime forbids new entries → WITHHOLD
 * - NER per trade exceeds allowed → WITHHOLD
 * - Earnings < 7 days → WITHHOLD
 *
 * @see agent_tasks.md Task 6
 * @see agent_skeleton_v1.0.md Section 6 (Risk & Sizing)
 */

import Decimal from 'decimal.js';
import {
  SizingOutput,
  SizingBatchOutput,
  GateResult,
  WithholdReason,
  EntryMode,
  SizingMultipliers,
  SizingActionType,
} from '@/types';
import { MarketPermissions, NewEntriesPermission, BreadthDirection, MarketStateOutput } from '@/types/market-state';
import { FocusListCandidate } from '@/types/focus-list';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended focus candidate data for sizing
 */
export interface SizingTickerData extends FocusListCandidate {
  /** Current price (entry price) */
  price: number;
  /** 21EMA low band (SSL) */
  ema21_low: number;
  /** Current ATR for reference */
  atr: number;
  /** Days until earnings */
  earnings_days: number;
}

/**
 * Portfolio context for sizing calculations
 */
export interface PortfolioContext {
  /** Total equity in dollars */
  equity: Decimal | number | string;
  /** Current net exposure as percentage (optional) */
  current_exposure_pct?: number;
  /** Current NER (New Exposure Risk) as percentage (optional) */
  current_ner_pct?: number;
  /** Max allowed NER per trade - overrides mode default (optional) */
  max_ner_per_trade_pct?: number;
  /** Max total exposure percentage (optional, default: 150%) */
  max_exposure_pct?: number;
}

/**
 * Market context from Task 1
 */
export interface MarketContext {
  /** Current market permissions */
  permissions: MarketPermissions;
  /** Full market state output (optional, for multiplier calculation) */
  marketState?: MarketStateOutput;
  /** Behavioral state from Alex journal (optional: TESTING/PRESSING/TRIMMING/DEFENSIVE/SELLING) */
  alexState?: string;
}

/**
 * Sizing configuration
 */
export interface SizingConfig {
  /** MODE1 position size range [min, max] (default: [10, 12]) */
  mode1_position_pct?: [number, number];
  /** MODE2 position size range [min, max] (default: [12, 15]) */
  mode2_position_pct?: [number, number];
  /** MODE1 max NER (default: 0.25%) */
  mode1_max_ner_pct?: number;
  /** MODE2 max NER (default: 0.50%) */
  mode2_max_ner_pct?: number;
  /** Min earnings days (default: 7) */
  min_earnings_days?: number;
  /** Use reduced size for LIMITED entries (default: true) */
  reduce_size_for_limited?: boolean;
  /** Size reduction factor for LIMITED (default: 0.5) */
  limited_size_factor?: number;

  // === NEW: Multiplier-based sizing options ===

  /** Use multiplier-based sizing (default: false for backwards compatibility) */
  use_multiplier_sizing?: boolean;
  /** Base NER for multiplier sizing (default: 1.5%) */
  base_ner_pct?: number;
  /** Portfolio equity (default: 100000) */
  portfolio_equity?: number;
  /** Min position size in dollars (default: 5000) */
  min_position_dollars?: number;
  /** Max position size in dollars (default: 20000) */
  max_position_dollars?: number;
}

/**
 * Detailed sizing calculation result
 */
interface SizingCalculation {
  ticker: string;
  mode: EntryMode;
  position_percent: Decimal;
  position_dollars: Decimal;
  entry: Decimal;
  ssl: Decimal;
  shares: number;
  r_per_share: Decimal;
  trim_2r_price: Decimal;
  ec_risk_percent: Decimal;
  ner_percent: Decimal;
}

/**
 * Gate evaluation result
 */
interface GateEvaluation {
  gate: GateResult;
  reason?: WithholdReason;
  details: string[];
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default sizing configuration from agent_skeleton Section 6
 */
export const DEFAULT_SIZING_CONFIG: Required<SizingConfig> = {
  mode1_position_pct: [10, 12],
  mode2_position_pct: [12, 15],
  mode1_max_ner_pct: 0.25,
  mode2_max_ner_pct: 0.50,
  min_earnings_days: 7,
  reduce_size_for_limited: true,
  limited_size_factor: 0.5,
  // NEW: Multiplier-based sizing defaults
  use_multiplier_sizing: false,
  base_ner_pct: 1.5,
  portfolio_equity: 100000,
  min_position_dollars: 5000,
  max_position_dollars: 20000,
};

// =============================================================================
// Sizing Multipliers (NEW)
// =============================================================================

/**
 * State multipliers based on Alex's behavioral state
 */
const STATE_MULTIPLIERS: Record<string, number> = {
  TESTING: 0.5,
  PRESSING: 1.2,
  TRIMMING: 0.7,
  DEFENSIVE: 0.5,
  SELLING: 0,
  NEUTRAL: 1.0,
};

/**
 * Calculate sizing multipliers based on market state and Alex state
 */
export function calculateSizingMultipliers(
  marketState?: MarketStateOutput,
  alexState?: string
): SizingMultipliers {
  // State multiplier from Alex journal (or default NEUTRAL)
  const stateLabel = alexState?.toUpperCase() || 'NEUTRAL';
  const stateMultiplier = STATE_MULTIPLIERS[stateLabel] ?? 1.0;

  // Breadth multiplier from market state
  const breadthMultiplier = marketState?.breadth_multiplier ?? 1.0;
  const breadthDirection = marketState?.breadth_direction;

  // QQQE structure multiplier
  let qqqeMultiplier = 1.0;
  let qqqePosition = 'inside';
  if (marketState?.qqqe_structure_position === 'above_cloud') {
    qqqeMultiplier = 1.1;
    qqqePosition = 'above';
  } else if (marketState?.qqqe_structure_position === 'below_cloud') {
    qqqeMultiplier = 0.5;
    qqqePosition = 'below';
  }

  // Combined multiplier (capped 0.3-1.3)
  const raw = stateMultiplier * breadthMultiplier * qqqeMultiplier;
  const combined = Math.min(1.3, Math.max(0.3, raw));

  return {
    state: stateMultiplier,
    state_label: stateLabel,
    breadth: breadthMultiplier,
    breadth_direction: breadthDirection,
    qqqe: qqqeMultiplier,
    qqqe_position: qqqePosition,
    combined,
  };
}

/**
 * Format trade in Discord equity-trades format
 */
export function formatDiscordTrade(
  ticker: string,
  positionPct: number,
  entry: number,
  ssl: number,
  ecRiskPct: number,
  trim2rPrice: number,
  actionType: SizingActionType = 'NEW_ENTRY'
): string {
  const action = actionType === 'ADD' ? 'ADD' : 'Long';
  return `${action} ${Math.round(positionPct)}% ${ticker} @ ${entry.toFixed(2)}`;
}

/**
 * Default portfolio limits
 */
const DEFAULT_MAX_EXPOSURE_PCT = 150;

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
// Position Sizing Calculations
// =============================================================================

/**
 * Get position size percentage for mode
 * Uses middle of range by default, or min for LIMITED entries
 */
function getPositionPercent(
  mode: EntryMode,
  config: Required<SizingConfig>,
  isLimited: boolean
): Decimal {
  const range = mode === 'MODE1'
    ? config.mode1_position_pct
    : config.mode2_position_pct;

  // Use middle of range normally
  let pct = toDecimal(range[0] + range[1]).div(2);

  // Reduce for LIMITED entries
  if (isLimited && config.reduce_size_for_limited) {
    pct = pct.times(config.limited_size_factor);
  }

  return pct;
}

/**
 * Get max NER for mode
 */
function getMaxNer(mode: EntryMode, config: Required<SizingConfig>): Decimal {
  return mode === 'MODE1'
    ? toDecimal(config.mode1_max_ner_pct)
    : toDecimal(config.mode2_max_ner_pct);
}

/**
 * Calculate position sizing for a single candidate
 */
function calculateSizing(
  candidate: SizingTickerData,
  equity: Decimal,
  config: Required<SizingConfig>,
  isLimited: boolean
): SizingCalculation {
  const entry = toDecimal(candidate.price);
  const ssl = toDecimal(candidate.ema21_low);
  const mode = candidate.mode;

  // Position size percentage
  const positionPercent = getPositionPercent(mode, config, isLimited);

  // Position in dollars
  const positionDollars = equity.times(positionPercent).div(100);

  // Number of shares (floor to whole shares)
  const sharesDecimal = positionDollars.div(entry).floor();
  const shares = sharesDecimal.toNumber();

  // R per share (risk per share = entry - stop)
  const rPerShare = entry.minus(ssl);

  // Total R in dollars
  const totalRiskDollars = rPerShare.times(shares);

  // EC risk percent (risk as % of equity)
  const ecRiskPercent = totalRiskDollars.div(equity).times(100);

  // NER percent (same as EC risk for new positions)
  const nerPercent = ecRiskPercent;

  // 2R trim price (entry + 2 * R)
  const trim2rPrice = entry.plus(rPerShare.times(2));

  return {
    ticker: candidate.ticker,
    mode,
    position_percent: positionPercent,
    position_dollars: positionDollars,
    entry,
    ssl,
    shares,
    r_per_share: rPerShare,
    trim_2r_price: trim2rPrice,
    ec_risk_percent: ecRiskPercent,
    ner_percent: nerPercent,
  };
}

// =============================================================================
// Risk Gate Evaluation
// =============================================================================

/**
 * Evaluate risk gate for a candidate
 */
function evaluateGate(
  candidate: SizingTickerData,
  sizing: SizingCalculation,
  market: MarketContext,
  portfolio: PortfolioContext,
  config: Required<SizingConfig>
): GateEvaluation {
  const details: string[] = [];
  const maxNer = getMaxNer(candidate.mode, config);

  // Gate 1: Market regime forbids new entries
  if (market.permissions.new_entries === 'NO') {
    return {
      gate: 'WITHHOLD',
      reason: 'regime_forbids_entries',
      details: ['Market regime forbids new entries (permissions.new_entries = NO)'],
    };
  }

  // Gate 2: Earnings < 7 days
  if (candidate.earnings_days < config.min_earnings_days) {
    return {
      gate: 'WITHHOLD',
      reason: 'earnings_too_close',
      details: [`Earnings in ${candidate.earnings_days} days < ${config.min_earnings_days} day minimum`],
    };
  }

  // Gate 3: NER exceeds allowed (with small tolerance for floating point)
  const nerTolerance = toDecimal(0.01); // 0.01% tolerance
  if (sizing.ner_percent.gt(maxNer.plus(nerTolerance))) {
    return {
      gate: 'WITHHOLD',
      reason: 'ner_exceeds_limit',
      details: [
        `NER ${sizing.ner_percent.toFixed(2)}% exceeds ${candidate.mode} limit of ${maxNer.toFixed(2)}%`,
      ],
    };
  }

  // Gate 4: Would exceed max exposure (optional check)
  if (portfolio.max_exposure_pct !== undefined || portfolio.current_exposure_pct !== undefined) {
    const maxExposure = toDecimal(portfolio.max_exposure_pct ?? DEFAULT_MAX_EXPOSURE_PCT);
    const currentExposure = toDecimal(portfolio.current_exposure_pct ?? 0);
    const newExposure = currentExposure.plus(sizing.position_percent);

    if (newExposure.gt(maxExposure)) {
      return {
        gate: 'WITHHOLD',
        reason: 'exposure_limit_reached',
        details: [
          `New exposure ${newExposure.toFixed(1)}% would exceed max ${maxExposure.toFixed(1)}%`,
        ],
      };
    }
  }

  // All gates passed
  if (market.permissions.new_entries === 'LIMITED') {
    details.push('Entry allowed (LIMITED mode - reduced size)');
  } else {
    details.push('All risk gates passed');
  }

  return {
    gate: 'PASS',
    details,
  };
}

// =============================================================================
// Output Conversion
// =============================================================================

/**
 * Convert sizing calculation and gate result to SizingOutput
 */
function toSizingOutput(
  sizing: SizingCalculation,
  gate: GateEvaluation,
  candidate: SizingTickerData,
  multipliers?: SizingMultipliers,
  actionType?: SizingActionType
): SizingOutput {
  const positionPct = sizing.position_percent.toNumber();
  const entry = sizing.entry.toNumber();
  const ssl = sizing.ssl.toNumber();
  const ecRiskPct = sizing.ec_risk_percent.toNumber();
  const trim2rPrice = sizing.trim_2r_price.toNumber();
  const action = actionType || 'NEW_ENTRY';

  return {
    task: 'sizing',
    ticker: sizing.ticker,
    mode: sizing.mode,
    position_percent: positionPct,
    position_dollars: sizing.position_dollars.toNumber(),
    entry,
    ssl,
    shares: sizing.shares,
    r_per_share: sizing.r_per_share.toNumber(),
    trim_2r_price: trim2rPrice,
    ec_risk_percent: ecRiskPct,
    gate: gate.gate,
    withhold_reason: gate.reason,
    // NEW: Multiplier and discord format fields
    multipliers,
    action_type: action,
    discord_format: formatDiscordTrade(sizing.ticker, positionPct, entry, ssl, ecRiskPct, trim2rPrice, action),
    trim_fraction: '1/3',
    trim_target_r: 2,
    // Backtest-style scoring fields from candidate
    grade: candidate.reclaim_backtest_grade as 'A' | 'B' | 'C' | undefined,
    score: candidate.score,
    rs: candidate.rs,
    dist_21ema_atr: candidate.dist_to_21ema_atr,
    close_range_pct: candidate.close_range_pct,
    is_contracting: candidate.is_contracting,
    setup_type: candidate.setup,
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 6 — Position Sizing & Risk Gate
 *
 * Calculates position size and applies risk gate for each focus candidate.
 *
 * @param candidates - Array of focus candidates from Task 5
 * @param portfolio - Portfolio context (equity, exposure)
 * @param market - Market context (permissions from Task 1)
 * @param config - Sizing configuration (uses defaults if not specified)
 * @returns SizingBatchOutput with sizing for each candidate and gate results
 *
 * @example
 * ```typescript
 * const result = calculatePositionSizing(
 *   focusCandidates,
 *   { equity: 100000 },
 *   { permissions: marketState.permissions }
 * );
 *
 * // Get passed trades
 * const passed = result.sizing.filter(s => s.gate === 'PASS');
 * console.log(passed[0].shares); // 416
 * console.log(passed[0].trim_2r_price); // 33.00
 * ```
 */
export function calculatePositionSizing(
  candidates: SizingTickerData[],
  portfolio: PortfolioContext,
  market: MarketContext,
  config?: SizingConfig
): SizingBatchOutput {
  // Merge config with defaults
  const mergedConfig: Required<SizingConfig> = {
    ...DEFAULT_SIZING_CONFIG,
    ...config,
    mode1_position_pct: config?.mode1_position_pct ?? DEFAULT_SIZING_CONFIG.mode1_position_pct,
    mode2_position_pct: config?.mode2_position_pct ?? DEFAULT_SIZING_CONFIG.mode2_position_pct,
  };

  const equity = toDecimal(portfolio.equity);
  const isLimited = market.permissions.new_entries === 'LIMITED';

  // Calculate multipliers if market state is available
  const multipliers = calculateSizingMultipliers(market.marketState, market.alexState);

  // Calculate sizing and evaluate gate for each candidate
  const sizingOutputs: SizingOutput[] = [];
  let totalPlannedDollars = new Decimal(0);
  let totalPlannedRiskPct = new Decimal(0);

  for (const candidate of candidates) {
    // Calculate sizing
    const sizing = calculateSizing(candidate, equity, mergedConfig, isLimited);

    // Evaluate risk gate
    const gate = evaluateGate(candidate, sizing, market, portfolio, mergedConfig);

    // Determine action type (NEW_ENTRY by default, could be ADD if existing position)
    const actionType: SizingActionType = 'NEW_ENTRY';

    // Convert to output with multipliers and backtest fields from candidate
    const output = toSizingOutput(sizing, gate, candidate, multipliers, actionType);
    sizingOutputs.push(output);

    // Track totals for passed trades
    if (gate.gate === 'PASS') {
      totalPlannedDollars = totalPlannedDollars.plus(sizing.position_dollars);
      totalPlannedRiskPct = totalPlannedRiskPct.plus(sizing.ec_risk_percent);
    }
  }

  return {
    task: 'sizing_batch',
    sizing: sizingOutputs,
    total_planned_dollars: totalPlannedDollars.toNumber(),
    total_planned_risk_pct: totalPlannedRiskPct.toNumber(),
  };
}

/**
 * Calculate sizing for a single candidate
 * Convenience function for individual calculations
 */
export function calculateSinglePositionSize(
  candidate: SizingTickerData,
  portfolio: PortfolioContext,
  market: MarketContext,
  config?: SizingConfig
): SizingOutput {
  const result = calculatePositionSizing([candidate], portfolio, market, config);
  return result.sizing[0];
}

/**
 * Get passed trades from sizing batch
 */
export function getPassedTrades(batch: SizingBatchOutput): SizingOutput[] {
  return batch.sizing.filter(s => s.gate === 'PASS');
}

/**
 * Get withheld trades from sizing batch
 */
export function getWithheldTrades(batch: SizingBatchOutput): SizingOutput[] {
  return batch.sizing.filter(s => s.gate === 'WITHHOLD');
}

/**
 * Get trades withheld for a specific reason
 */
export function getTradesWithheldFor(
  batch: SizingBatchOutput,
  reason: WithholdReason
): SizingOutput[] {
  return batch.sizing.filter(s => s.gate === 'WITHHOLD' && s.withhold_reason === reason);
}

/**
 * Calculate R multiple for a given price
 * Useful for tracking position performance
 */
export function calculateRMultiple(
  entry: number | Decimal,
  ssl: number | Decimal,
  currentPrice: number | Decimal
): Decimal {
  const entryDec = toDecimal(entry);
  const sslDec = toDecimal(ssl);
  const priceDec = toDecimal(currentPrice);

  const rPerShare = entryDec.minus(sslDec);

  if (rPerShare.isZero()) {
    return new Decimal(0);
  }

  const pnlPerShare = priceDec.minus(entryDec);
  return pnlPerShare.div(rPerShare);
}

/**
 * Calculate shares for target risk amount
 * Useful for sizing to specific risk tolerance
 */
export function calculateSharesForRisk(
  entry: number | Decimal,
  ssl: number | Decimal,
  targetRiskDollars: number | Decimal
): number {
  const entryDec = toDecimal(entry);
  const sslDec = toDecimal(ssl);
  const riskDec = toDecimal(targetRiskDollars);

  const rPerShare = entryDec.minus(sslDec);

  if (rPerShare.isZero() || rPerShare.isNegative()) {
    return 0;
  }

  return riskDec.div(rPerShare).floor().toNumber();
}

/**
 * Validate SSL is below entry price
 * Returns true if valid, false if SSL >= entry
 */
export function validateStopLoss(
  entry: number | Decimal,
  ssl: number | Decimal
): boolean {
  const entryDec = toDecimal(entry);
  const sslDec = toDecimal(ssl);

  return sslDec.lt(entryDec);
}

// =============================================================================
// Market State Integration (Task 1)
// =============================================================================

/**
 * Derive market permissions from Task 1 market state
 * Per agent_skeleton_v1.0.md Section 1
 */
export function deriveMarketPermissions(
  state: string,
  structurePosition: string,
  structureSlope: string
): MarketPermissions {
  // Default permissions based on state
  const permissionMap: Record<string, MarketPermissions> = {
    'CONFIRMED_UPTREND': {
      new_entries: 'YES',
      adds: true,
      pressing: true,
      trims: true,
    },
    'EARLY_CONFIRMATION': {
      new_entries: 'LIMITED',
      adds: true,
      pressing: false,
      trims: true,
    },
    'PARTICIPATION_FADE': {
      new_entries: 'LIMITED',
      adds: false,
      pressing: false,
      trims: true,
    },
    'BREAKDOWN': {
      new_entries: 'NO',
      adds: false,
      pressing: false,
      trims: true,
    },
    'WASHOUT': {
      new_entries: 'NO',
      adds: false,
      pressing: false,
      trims: false,
    },
  };

  // Get base permissions from state
  let permissions = permissionMap[state] ?? {
    new_entries: 'NO' as NewEntriesPermission,
    adds: false,
    pressing: false,
    trims: true,
  };

  // Additional checks based on structure
  if (structurePosition === 'below_cloud' || structureSlope === 'falling') {
    permissions = {
      ...permissions,
      new_entries: 'NO',
      pressing: false,
    };
  }

  return permissions;
}

/**
 * Create market context from Task 1 data
 */
export function createMarketContext(
  state: string,
  structurePosition: string,
  structureSlope: string,
  existingPermissions?: MarketPermissions
): MarketContext {
  const permissions = existingPermissions ?? deriveMarketPermissions(
    state,
    structurePosition,
    structureSlope
  );

  return { permissions };
}

// =============================================================================
// Data Merging Helpers (Tasks 2-5 Integration)
// =============================================================================

/**
 * Combined data from Tasks 2-5 for sizing
 */
export interface CombinedSizingData {
  // From Task 2 (Universe)
  ticker: string;
  rs: number;
  theme: string;
  // From Task 3 (Pullback)
  price: number;
  ema21_low: number;
  atr: number;
  dist_21_atr: number;
  ready_grade: 'A' | 'B' | 'C';
  // From Task 4 (Readiness)
  mode: EntryMode;
  earnings_days: number;
  setup?: string;
  entry_trigger?: string;
  // From Task 5 (Focus List)
  rank: number;
}

/**
 * Merge data from Tasks 2-5 into SizingTickerData format
 */
export function mergeSizingData(data: CombinedSizingData): SizingTickerData {
  return {
    // FocusListCandidate fields
    rank: data.rank,
    ticker: data.ticker,
    theme: data.theme,
    mode: data.mode,
    setup: data.setup ?? '',
    entry_trigger: data.entry_trigger ?? '',
    dist_to_21ema_atr: data.dist_21_atr,
    earnings_days: data.earnings_days,
    reclaim_backtest_grade: data.ready_grade,
    is_promoted: false,

    // Extended fields for sizing
    price: data.price,
    ema21_low: data.ema21_low,
    atr: data.atr,
  };
}

/**
 * Detailed sizing result for display/debugging
 */
export interface DetailedSizingResult {
  ticker: string;
  mode: EntryMode;
  // Entry & Stop
  entry_price: number;
  ssl_price: number;
  // Sizing
  position_pct: number;
  position_dollars: number;
  shares: number;
  // Risk metrics
  r_per_share: number;
  total_r_dollars: number;
  ec_risk_pct: number;
  ner_pct: number;
  max_ner_pct: number;
  // Profit target
  trim_2r_price: number;
  // Gate
  gate: GateResult;
  withhold_reason?: WithholdReason;
  gate_details: string[];
}

/**
 * Calculate sizing with detailed output for testing
 */
export function calculateSizingWithDetails(
  candidate: SizingTickerData,
  portfolio: PortfolioContext,
  market: MarketContext,
  config?: SizingConfig
): DetailedSizingResult {
  const mergedConfig: Required<SizingConfig> = {
    ...DEFAULT_SIZING_CONFIG,
    ...config,
    mode1_position_pct: config?.mode1_position_pct ?? DEFAULT_SIZING_CONFIG.mode1_position_pct,
    mode2_position_pct: config?.mode2_position_pct ?? DEFAULT_SIZING_CONFIG.mode2_position_pct,
  };

  const equity = toDecimal(portfolio.equity);
  const isLimited = market.permissions.new_entries === 'LIMITED';

  // Calculate sizing
  const sizing = calculateSizing(candidate, equity, mergedConfig, isLimited);

  // Evaluate gate
  const gate = evaluateGate(candidate, sizing, market, portfolio, mergedConfig);

  // Get max NER for mode
  const maxNer = getMaxNer(candidate.mode, mergedConfig);

  return {
    ticker: sizing.ticker,
    mode: sizing.mode,
    entry_price: sizing.entry.toNumber(),
    ssl_price: sizing.ssl.toNumber(),
    position_pct: Math.round(sizing.position_percent.toNumber() * 100) / 100,
    position_dollars: Math.round(sizing.position_dollars.toNumber() * 100) / 100,
    shares: sizing.shares,
    r_per_share: Math.round(sizing.r_per_share.toNumber() * 100) / 100,
    total_r_dollars: Math.round(sizing.r_per_share.times(sizing.shares).toNumber() * 100) / 100,
    ec_risk_pct: Math.round(sizing.ec_risk_percent.toNumber() * 100) / 100,
    ner_pct: Math.round(sizing.ner_percent.toNumber() * 100) / 100,
    max_ner_pct: maxNer.toNumber(),
    trim_2r_price: Math.round(sizing.trim_2r_price.toNumber() * 100) / 100,
    gate: gate.gate,
    withhold_reason: gate.reason,
    gate_details: gate.details,
  };
}

/**
 * Calculate batch sizing with detailed output
 */
export function calculateBatchSizingWithDetails(
  candidates: SizingTickerData[],
  portfolio: PortfolioContext,
  market: MarketContext,
  config?: SizingConfig
): {
  results: DetailedSizingResult[];
  summary: {
    total_positions: number;
    total_dollars: number;
    total_ner_pct: number;
    passed_count: number;
    withheld_count: number;
  };
} {
  const results = candidates.map(c =>
    calculateSizingWithDetails(c, portfolio, market, config)
  );

  // Calculate summary for passed trades
  const passedResults = results.filter(r => r.gate === 'PASS');
  const totalDollars = passedResults.reduce((sum, r) => sum + r.position_dollars, 0);
  const totalNerPct = passedResults.reduce((sum, r) => sum + r.ner_pct, 0);

  return {
    results,
    summary: {
      total_positions: passedResults.length,
      total_dollars: Math.round(totalDollars * 100) / 100,
      total_ner_pct: Math.round(totalNerPct * 100) / 100,
      passed_count: passedResults.length,
      withheld_count: results.length - passedResults.length,
    },
  };
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  getPositionPercent,
  getMaxNer,
  calculateSizing,
  evaluateGate,
  toSizingOutput,
  toDecimal,
};

export type { SizingCalculation, GateEvaluation };
