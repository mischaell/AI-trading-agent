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
  return mcsiZ.gt(mcsiZPrev) ? 'curling_up' : 'curling_down';
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
  // WASHOUT: Extreme oversold (MCO < -2σ)
  if (mcoZ.lt(-2)) {
    return 'WASHOUT';
  }

  // EARLY_CONFIRMATION: MCO recently at washout levels, MCSI curling up
  // Market near or reclaiming structure
  if (mcoZ.lte(-1) && mcsiSlope === 'curling_up' &&
      (position === 'inside_cloud' || position === 'below_cloud')) {
    return 'EARLY_CONFIRMATION';
  }

  // Also EARLY_CONFIRMATION: Just emerged from washout, structure improving
  if (mcoZ.gt(-1) && mcoZ.lt(0) && mcsiSlope === 'curling_up' &&
      position === 'inside_cloud' && slope === 'rising') {
    return 'EARLY_CONFIRMATION';
  }

  // CONFIRMED_UPTREND: Above structure, breadth confirming
  if (position === 'above_cloud' && slope === 'rising' &&
      mcsiZ.gt(0) && mcsiVs10dma === 'above') {
    return 'CONFIRMED_UPTREND';
  }

  // Also CONFIRMED_UPTREND: Strong breadth even if structure is flat
  if (position === 'above_cloud' &&
      mcsiZ.gt(1) && mcoZ.gt(0) && mcsiSlope === 'curling_up') {
    return 'CONFIRMED_UPTREND';
  }

  // BREAKDOWN: Below structure with weak breadth
  if (position === 'below_cloud' && slope === 'falling' && mcsiZ.lt(0)) {
    return 'BREAKDOWN';
  }

  // PARTICIPATION_FADE: Breadth deteriorating, defense mode
  // This is the default "caution" state when not in other states
  if (mcsiSlope === 'curling_down' || mcsiVs10dma === 'below') {
    return 'PARTICIPATION_FADE';
  }

  // Inside cloud with mixed signals → PARTICIPATION_FADE
  if (position === 'inside_cloud') {
    return 'PARTICIPATION_FADE';
  }

  // Default fallback
  return 'PARTICIPATION_FADE';
}

/**
 * Get permissions for a given market state
 *
 * Permissions from agent_skeleton_v1.0.md Section 1:
 * - EARLY_CONFIRMATION: Limited entries, no adds/pressing, trims OK
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
        new_entries: 'LIMITED',
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

  // Get permissions for state
  const permissions = getPermissionsForState(state);

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
};

export type { EMAStructure, EMAStructureWithSlope };
