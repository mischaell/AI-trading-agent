/**
 * Task 1 — Market Analysis (QQQE + Breadth)
 *
 * Analyzes QQQE structure and Nasdaq-100 breadth to determine market state.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * @see agent_tasks.md Task 1
 * @see agent_skeleton_v1.0.md Sections 1-2
 */

import Decimal from 'decimal.js';
import {
  MarketStateOutput,
  MarketStateLabel,
  MarketPermissions,
  QqqeStructurePosition,
  QqqeStructureSlope,
  McsiSlope,
  McsiVs10dma,
  NewEntriesPermission,
  BreadthDirection,
} from '@/types';

// =============================================================================
// Types
// =============================================================================

/**
 * OHLC bar data for a single day
 */
export interface OHLCBar {
  date: string;
  open: Decimal | number | string;
  high: Decimal | number | string;
  low: Decimal | number | string;
  close: Decimal | number | string;
}

/**
 * Breadth data for MCO/MCSI indicators
 */
export interface BreadthData {
  /** McClellan Oscillator z-score */
  mco_z: Decimal | number | string;
  /** McClellan Summation Index z-score */
  mcsi_z: Decimal | number | string;
  /** MCSI 10-day moving average */
  mcsi_10dma: Decimal | number | string;
  /** Previous day's MCSI z-score (for slope detection) */
  mcsi_z_prev: Decimal | number | string;

  // === Optional: Raw values for direction calculation ===
  /** Raw MCO value (not z-score) */
  mco_value?: number;
  /** Previous day's raw MCO value */
  mco_value_prev?: number;
  /** Raw MCSI value (not z-score) */
  mcsi_value?: number;
  /** Previous day's raw MCSI value */
  mcsi_value_prev?: number;
}

/**
 * 21EMA structure values
 */
interface EMAStructure {
  /** 21EMA of highs */
  maHigh: Decimal;
  /** 21EMA of closes */
  maClose: Decimal;
  /** 21EMA of lows */
  maLow: Decimal;
}

/**
 * EMA structure with slope data
 */
interface EMAStructureWithSlope extends EMAStructure {
  /** Previous period's maClose for slope calculation */
  prevMaClose: Decimal;
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
// EMA Calculation
// =============================================================================

/**
 * Calculate Exponential Moving Average using Decimal.js
 *
 * @param values - Array of values (oldest first)
 * @param length - EMA period
 * @returns Array of EMA values
 */
function calculateEMA(values: Decimal[], length: number): Decimal[] {
  if (values.length === 0) return [];
  if (values.length < length) {
    throw new Error(`Insufficient data: need ${length} bars, got ${values.length}`);
  }

  const k = new Decimal(2).div(new Decimal(length).plus(1));
  const oneMinusK = new Decimal(1).minus(k);

  const emaValues: Decimal[] = [];

  // Initialize with SMA of first `length` values
  let sum = new Decimal(0);
  for (let i = 0; i < length; i++) {
    sum = sum.plus(values[i]);
  }
  let ema = sum.div(length);

  // For indices before length, we don't have valid EMA
  for (let i = 0; i < length - 1; i++) {
    emaValues.push(new Decimal(0)); // Placeholder
  }
  emaValues.push(ema);

  // Calculate EMA for remaining values
  for (let i = length; i < values.length; i++) {
    ema = values[i].times(k).plus(ema.times(oneMinusK));
    emaValues.push(ema);
  }

  return emaValues;
}

/**
 * Calculate 21EMA structure (MAHigh, MAClose, MALow)
 *
 * @param bars - OHLC bars (oldest first)
 * @returns EMA structure with current and previous values
 */
function calculate21EMAStructure(bars: OHLCBar[]): EMAStructureWithSlope {
  const EMA_LENGTH = 21;

  if (bars.length < EMA_LENGTH + 1) {
    throw new Error(`Insufficient data: need at least ${EMA_LENGTH + 1} bars for slope calculation`);
  }

  const highs = bars.map(b => toDecimal(b.high));
  const closes = bars.map(b => toDecimal(b.close));
  const lows = bars.map(b => toDecimal(b.low));

  const emaHighs = calculateEMA(highs, EMA_LENGTH);
  const emaCloses = calculateEMA(closes, EMA_LENGTH);
  const emaLows = calculateEMA(lows, EMA_LENGTH);

  const lastIdx = bars.length - 1;
  const prevIdx = bars.length - 2;

  return {
    maHigh: emaHighs[lastIdx],
    maClose: emaCloses[lastIdx],
    maLow: emaLows[lastIdx],
    prevMaClose: emaCloses[prevIdx],
  };
}

// =============================================================================
// Structure Analysis
// =============================================================================

/**
 * Determine price position relative to 21EMA structure cloud
 *
 * @param close - Current close price
 * @param structure - EMA structure values
 * @returns Structure position
 */
function determineStructurePosition(
  close: Decimal,
  structure: EMAStructure
): QqqeStructurePosition {
  // Above cloud: close > all three EMAs
  if (close.gt(structure.maHigh) &&
      close.gt(structure.maClose) &&
      close.gt(structure.maLow)) {
    return 'above_cloud';
  }

  // Below cloud: close < all three EMAs
  if (close.lt(structure.maHigh) &&
      close.lt(structure.maClose) &&
      close.lt(structure.maLow)) {
    return 'below_cloud';
  }

  // Inside cloud: close is within the structure
  return 'inside_cloud';
}

/**
 * Determine 21EMA structure slope
 *
 * Uses a threshold to avoid noise in flat markets.
 *
 * @param structure - EMA structure with current and previous values
 * @returns Structure slope
 */
function determineStructureSlope(
  structure: EMAStructureWithSlope
): QqqeStructureSlope {
  const change = structure.maClose.minus(structure.prevMaClose);
  const percentChange = change.div(structure.prevMaClose).times(100);

  // Threshold: 0.05% change to be considered rising/falling
  const SLOPE_THRESHOLD = new Decimal(0.05);

  if (percentChange.gt(SLOPE_THRESHOLD)) {
    return 'rising';
  }

  if (percentChange.lt(SLOPE_THRESHOLD.neg())) {
    return 'falling';
  }

  return 'flat';
}

// =============================================================================
// Breadth Analysis
// =============================================================================

/**
 * Determine MCSI slope (curling up or down)
 *
 * @param mcsiZ - Current MCSI z-score
 * @param mcsiZPrev - Previous MCSI z-score
 * @returns MCSI slope direction
 */
function determineMcsiSlope(
  mcsiZ: Decimal,
  mcsiZPrev: Decimal
): McsiSlope {
  // If equal (e.g., no previous data available), default to 'curling_up'
  // to avoid falsely triggering PARTICIPATION_FADE
  return mcsiZ.gte(mcsiZPrev) ? 'curling_up' : 'curling_down';
}

/**
 * Determine MCSI position vs 10DMA
 *
 * @param mcsiZ - Current MCSI z-score
 * @param mcsi10dma - MCSI 10-day moving average
 * @returns Position relative to 10DMA
 */
function determineMcsiVs10dma(
  mcsiZ: Decimal,
  mcsi10dma: Decimal
): McsiVs10dma {
  return mcsiZ.gte(mcsi10dma) ? 'above' : 'below';
}

// =============================================================================
// Breadth Direction (NEW)
// =============================================================================

/**
 * Calculate breadth direction based on day-over-day MCO change
 *
 * @param mcoChange - Day-over-day change in MCO value
 * @returns BreadthDirection
 */
function calculateBreadthDirection(mcoChange: number): BreadthDirection {
  if (mcoChange > 3) return 'HOOK_UP';      // Very bullish reversal
  if (mcoChange > 1) return 'EXPANDING';    // Bullish momentum
  if (mcoChange < -3) return 'HOOK_DOWN';   // Very bearish reversal
  if (mcoChange < -1) return 'CONTRACTING'; // Bearish momentum
  return 'FLAT';                             // Neutral
}

/**
 * Get breadth multiplier for position sizing
 *
 * Based on breadth direction and z-score extremes
 *
 * @param direction - Current breadth direction
 * @param mcoZ - MCO z-score (for overbought/oversold detection)
 * @returns Multiplier between 0.7 and 1.2
 */
function getBreadthMultiplier(direction: BreadthDirection, mcoZ: number): number {
  const isOverbought = mcoZ >= 1;
  const isOversold = mcoZ <= -1;

  // Direction takes priority, z-score modifies
  if (direction === 'HOOK_UP' && !isOverbought) return 1.2;  // Strong bullish, not extended
  if (direction === 'HOOK_DOWN') return 0.7;                  // Strong bearish
  if (direction === 'EXPANDING') return 1.1;                  // Bullish
  if (direction === 'CONTRACTING') return 0.85;               // Bearish

  // Flat direction - check extremes
  if (isOverbought) return 0.8;    // Extended, reduce size
  if (isOversold) return 0.75;     // Oversold, cautious

  return 1.0;  // Neutral
}

// =============================================================================
// Market State Determination
// =============================================================================

/**
 * Determine market state label based on structure and breadth
 *
 * States from agent_skeleton_v1.0.md Section 1:
 * - EARLY_CONFIRMATION: MCO washout, MCSI curling up, market near structure
 * - CONFIRMED_UPTREND: Above structure, breadth confirming
 * - PARTICIPATION_FADE: Breadth deteriorating, defense mode
 * - BREAKDOWN: Below structure, breadth weak
 * - WASHOUT: Extreme oversold, potential bottom
 *
 * @param position - Structure position
 * @param slope - Structure slope
 * @param mcoZ - MCO z-score
 * @param mcsiZ - MCSI z-score
 * @param mcsiSlope - MCSI slope direction
 * @param mcsiVs10dma - MCSI vs 10DMA
 * @returns Market state label
 */
function determineMarketState(
  position: QqqeStructurePosition,
  slope: QqqeStructureSlope,
  mcoZ: Decimal,
  mcsiZ: Decimal,
  mcsiSlope: McsiSlope,
  mcsiVs10dma: McsiVs10dma
): MarketStateLabel {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 1: QQQE Structure determines if we can trade
  // PRIORITY 2: Breadth (MCO/MCSI) determines how aggressive
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────────
  // QQQE ABOVE STRUCTURE: Always tradeable - breadth determines aggression level
  // Per Alex: QQQE structure = can we trade, breadth = how aggressive
  // ─────────────────────────────────────────────────────────────────────────────
  if (position === 'above_cloud') {
    // Above structure + rising slope = CONFIRMED_UPTREND (PRESSING - full aggression)
    if (slope === 'rising') {
      return 'CONFIRMED_UPTREND';
    }
    // Above structure + flat/falling slope but good breadth = CONFIRMED_UPTREND
    if (mcsiSlope === 'curling_up' || mcoZ.gt(0)) {
      return 'CONFIRMED_UPTREND';
    }
    // Above structure but breadth not confirming = EARLY_CONFIRMATION (TESTING - reduced size)
    // Still tradeable, just not pressing
    return 'EARLY_CONFIRMATION';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QQQE INSIDE STRUCTURE: Cautious - breadth determines if tradeable
  // Per Alex: Inside cloud = uncertain, need breadth confirmation
  // ─────────────────────────────────────────────────────────────────────────────
  if (position === 'inside_cloud') {
    // Inside cloud + rising slope = EARLY_CONFIRMATION (testing allowed)
    if (slope === 'rising') {
      return 'EARLY_CONFIRMATION';
    }
    // Inside cloud + flat slope + breadth not deteriorating = EARLY_CONFIRMATION
    if (slope === 'flat' && mcsiSlope === 'curling_up') {
      return 'EARLY_CONFIRMATION';
    }
    // Inside cloud + flat slope + neutral/positive MCO = EARLY_CONFIRMATION
    if (slope === 'flat' && mcoZ.gte(0)) {
      return 'EARLY_CONFIRMATION';
    }
    // Inside cloud with falling slope or deteriorating breadth = PARTICIPATION_FADE (DEFENSIVE)
    return 'PARTICIPATION_FADE';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QQQE BELOW STRUCTURE: Generally no new trades, but watch for reclaim attempts
  // Per Alex: Below cloud but close to structure + higher low = EARLY_CONFIRMATION (testing)
  // ─────────────────────────────────────────────────────────────────────────────
  if (position === 'below_cloud') {
    // Extreme oversold (MCO < -2σ) = WASHOUT (potential bottom)
    if (mcoZ.lt(-2)) {
      return 'WASHOUT';
    }
    // Below structure but slope rising = higher low forming, attempting reclaim
    // This is the "close to structure + higher low" scenario = EARLY_CONFIRMATION (testing pilots)
    if (slope === 'rising') {
      return 'EARLY_CONFIRMATION';
    }
    // Below structure but breadth improving = EARLY_CONFIRMATION (recovery starting)
    if (mcsiSlope === 'curling_up' && mcoZ.gt(-1)) {
      return 'EARLY_CONFIRMATION';
    }
    // Below structure with weak breadth and no reclaim attempt = BREAKDOWN
    return 'BREAKDOWN';
  }

  // Default fallback (shouldn't reach here)
  return 'PARTICIPATION_FADE';
}

/**
 * Get permissions for a given market state
 *
 * Permissions from agent_skeleton_v1.0.md Section 1:
 * - EARLY_CONFIRMATION: Entries allowed, adds OK, no pressing, trims OK
 * - CONFIRMED_UPTREND: Full permissions
 * - PARTICIPATION_FADE: No new entries/adds/pressing, trims OK
 * - BREAKDOWN: No entries, trims only
 * - WASHOUT: No entries (wait for turn), trims OK
 *
 * @param state - Market state label
 * @returns Trading permissions
 */
function getPermissionsForState(state: MarketStateLabel): MarketPermissions {
  switch (state) {
    case 'CONFIRMED_UPTREND':
      return {
        new_entries: 'YES',
        adds: true,
        pressing: true,
        trims: true,
      };

    case 'EARLY_CONFIRMATION':
      return {
        new_entries: 'YES',
        adds: true,
        pressing: false,
        trims: true,
      };

    case 'PARTICIPATION_FADE':
      return {
        new_entries: 'NO',
        adds: false,
        pressing: false,
        trims: true,
      };

    case 'BREAKDOWN':
      return {
        new_entries: 'NO',
        adds: false,
        pressing: false,
        trims: true,
      };

    case 'WASHOUT':
      return {
        new_entries: 'NO',
        adds: false,
        pressing: false,
        trims: true,
      };

    default:
      // Defensive default: no new risk
      return {
        new_entries: 'NO',
        adds: false,
        pressing: false,
        trims: true,
      };
  }
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 1 — Market Analysis
 *
 * Analyzes QQQE structure and Nasdaq-100 breadth to determine market state.
 *
 * @param qqqeBars - Array of QQQE OHLC bars (oldest first, minimum 22 bars)
 * @param breadth - Current breadth indicator data (MCO/MCSI)
 * @returns MarketStateOutput with state label and permissions
 *
 * @example
 * ```typescript
 * const result = analyzeMarketState(qqqeBars, {
 *   mco_z: -0.69,
 *   mcsi_z: -0.38,
 *   mcsi_10dma: -0.20,
 *   mcsi_z_prev: -0.45,
 * });
 * console.log(result.state); // 'EARLY_CONFIRMATION'
 * ```
 */
export function analyzeMarketState(
  qqqeBars: OHLCBar[],
  breadth: BreadthData
): MarketStateOutput {
  // Validate input
  if (!qqqeBars || qqqeBars.length < 22) {
    throw new Error('Insufficient QQQE data: need at least 22 bars');
  }

  // Convert breadth data to Decimal
  const mcoZ = toDecimal(breadth.mco_z);
  const mcsiZ = toDecimal(breadth.mcsi_z);
  const mcsi10dma = toDecimal(breadth.mcsi_10dma);
  const mcsiZPrev = toDecimal(breadth.mcsi_z_prev);

  // Calculate 21EMA structure
  const structure = calculate21EMAStructure(qqqeBars);

  // Get current close price
  const currentClose = toDecimal(qqqeBars[qqqeBars.length - 1].close);

  // Determine structure position and slope
  const structurePosition = determineStructurePosition(currentClose, structure);
  const structureSlope = determineStructureSlope(structure);

  // Determine breadth indicators
  const mcsiSlope = determineMcsiSlope(mcsiZ, mcsiZPrev);
  const mcsiVs10dma = determineMcsiVs10dma(mcsiZ, mcsi10dma);

  // Determine market state
  const state = determineMarketState(
    structurePosition,
    structureSlope,
    mcoZ,
    mcsiZ,
    mcsiSlope,
    mcsiVs10dma
  );

  // Calculate breadth direction if raw values are provided
  const mcoValue = breadth.mco_value ?? undefined;
  const mcoValuePrev = breadth.mco_value_prev ?? undefined;
  const mcsiValue = breadth.mcsi_value ?? undefined;
  const mcsiValuePrev = breadth.mcsi_value_prev ?? undefined;

  let mcoChange: number | undefined;
  let mcsiChange: number | undefined;
  let breadthDirection: BreadthDirection | undefined;
  let breadthMultiplier: number | undefined;

  if (mcoValue !== undefined && mcoValuePrev !== undefined) {
    mcoChange = mcoValue - mcoValuePrev;
    breadthDirection = calculateBreadthDirection(mcoChange);
    breadthMultiplier = getBreadthMultiplier(breadthDirection, mcoZ.toNumber());
  }

  // Get permissions for state
  const permissions = getPermissionsForState(state);

  // Override: Disable pressing when breadth is contracting, even in confirmed uptrend
  // Per Alex: Pressing requires BOTH structure confirmation AND healthy breadth
  if (breadthDirection === 'CONTRACTING' || breadthDirection === 'HOOK_DOWN') {
    permissions.pressing = false;
  }

  if (mcsiValue !== undefined && mcsiValuePrev !== undefined) {
    mcsiChange = mcsiValue - mcsiValuePrev;
  }

  return {
    task: 'market_state',
    market: 'QQQE',
    breadth_universe: 'Nasdaq100',
    qqqe_structure_position: structurePosition,
    qqqe_structure_slope: structureSlope,
    mco_z: mcoZ.toNumber(),
    mcsi_z: mcsiZ.toNumber(),
    mcsi_slope: mcsiSlope,
    mcsi_vs_10dma: mcsiVs10dma,
    state,
    permissions,
    // NEW: Breadth direction fields
    mco_value: mcoValue,
    mco_change: mcoChange,
    mcsi_value: mcsiValue,
    mcsi_change: mcsiChange,
    breadth_direction: breadthDirection,
    breadth_multiplier: breadthMultiplier,
  };
}

// =============================================================================
// Real Data Integration
// =============================================================================

import { fetchQQQE, OHLCData } from '@/lib/market-data';
import { getBreadthData, BreadthData as BreadthDataDB } from '@/lib/market-data';

/**
 * Convert OHLCData from Yahoo Finance to OHLCBar for analysis
 */
function convertToOHLCBar(data: OHLCData): OHLCBar {
  return {
    date: data.date,
    open: data.open,
    high: data.high,
    low: data.low,
    close: data.close,
  };
}

/**
 * Convert database breadth data to analysis format
 */
function convertToBreadthData(data: BreadthDataDB, prevMcsiZ?: number): BreadthData {
  return {
    mco_z: data.mco_z ?? 0,
    mcsi_z: data.mcsi_z ?? 0,
    mcsi_10dma: data.mcsi_z ?? 0, // Approximate - would need history for real 10DMA
    mcsi_z_prev: prevMcsiZ ?? (data.mcsi_z ?? 0),
  };
}

/**
 * Analyze market state using real data from Yahoo Finance and Supabase
 * Falls back to mock data if real data is unavailable
 *
 * @param mockQqqeBars - Fallback QQQE data if Yahoo fails
 * @param mockBreadth - Fallback breadth data if Supabase fails
 * @returns Market state analysis
 */
export async function analyzeMarketStateWithRealData(
  mockQqqeBars: OHLCBar[],
  mockBreadth: BreadthData
): Promise<MarketStateOutput> {
  let qqqeBars: OHLCBar[] = mockQqqeBars;
  let breadth: BreadthData = mockBreadth;

  // Try to fetch real QQQE data
  try {
    const realQqqeData = await fetchQQQE();
    if (realQqqeData.length >= 22) {
      qqqeBars = realQqqeData.map(convertToOHLCBar);
      console.log(`[MarketAnalysis] Using real QQQE data (${qqqeBars.length} bars)`);
    } else {
      console.log('[MarketAnalysis] Insufficient real QQQE data, using mock');
    }
  } catch (error) {
    console.warn('[MarketAnalysis] Failed to fetch QQQE, using mock:', error);
  }

  // Try to fetch real breadth data
  try {
    const realBreadthData = await getBreadthData();
    if (realBreadthData.mco !== undefined && realBreadthData.mcsi !== undefined) {
      // Note: For proper MCSI slope, we'd need historical data
      // For now, we use the Z-scores directly if available
      breadth = convertToBreadthData(realBreadthData);
      console.log(`[MarketAnalysis] Using real breadth data for ${realBreadthData.date}`);
    } else {
      console.log('[MarketAnalysis] Incomplete breadth data, using mock');
    }
  } catch (error) {
    console.warn('[MarketAnalysis] Failed to fetch breadth, using mock:', error);
  }

  // Run the analysis
  return analyzeMarketState(qqqeBars, breadth);
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  calculateEMA,
  calculate21EMAStructure,
  determineStructurePosition,
  determineStructureSlope,
  determineMcsiSlope,
  determineMcsiVs10dma,
  determineMarketState,
  getPermissionsForState,
  toDecimal,
  convertToOHLCBar,
  convertToBreadthData,
  // NEW: Breadth direction
  calculateBreadthDirection,
  getBreadthMultiplier,
};

export type { EMAStructure, EMAStructureWithSlope };
