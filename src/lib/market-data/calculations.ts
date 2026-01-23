/**
 * Market Data Calculations
 *
 * Technical analysis calculations using Decimal.js for precision.
 * Implements 21EMA structure analysis per TradingAgent rules.
 */

import Decimal from 'decimal.js';
import { OHLCData } from './client';

// =============================================================================
// Types
// =============================================================================

export type StructurePosition = 'above_cloud' | 'inside_cloud' | 'below_cloud';
export type StructureSlope = 'rising' | 'flat' | 'falling';

export interface EMA21Structure {
  /** 21EMA of daily highs */
  maHigh: Decimal;
  /** 21EMA of daily closes */
  maClose: Decimal;
  /** 21EMA of daily lows */
  maLow: Decimal;
  /** Current close price */
  currentClose: Decimal;
  /** Position relative to EMA cloud */
  position: StructurePosition;
  /** Slope of the EMA (based on maClose history) */
  slope: StructureSlope;
}

// =============================================================================
// EMA Calculation
// =============================================================================

/**
 * Calculate Exponential Moving Average
 * @param prices - Array of prices (oldest first)
 * @param period - EMA period (e.g., 21)
 * @returns Array of EMA values (same length as input, first `period-1` values are warm-up)
 */
export function calculateEMA(prices: Decimal[], period: number): Decimal[] {
  if (prices.length === 0) return [];
  if (prices.length < period) {
    console.warn(`[Calculations] Not enough data for ${period}-period EMA`);
    return prices.map(() => new Decimal(0));
  }

  const multiplier = new Decimal(2).div(period + 1);
  const emaValues: Decimal[] = [];

  // Calculate initial SMA for the first EMA value
  let sum = new Decimal(0);
  for (let i = 0; i < period; i++) {
    sum = sum.plus(prices[i]);
  }
  let ema = sum.div(period);

  // Fill warm-up period with the initial SMA
  for (let i = 0; i < period - 1; i++) {
    emaValues.push(ema);
  }

  // Calculate EMA for remaining values
  for (let i = period - 1; i < prices.length; i++) {
    if (i === period - 1) {
      emaValues.push(ema);
    } else {
      // EMA = (Close - EMA(prev)) * multiplier + EMA(prev)
      ema = prices[i].minus(ema).times(multiplier).plus(ema);
      emaValues.push(ema);
    }
  }

  return emaValues;
}

/**
 * Calculate 21EMA structure (high, close, low bands)
 * @param ohlcData - Array of OHLC data (oldest first)
 * @returns EMA21Structure with position and slope
 */
export function calculate21EMAStructure(ohlcData: OHLCData[]): EMA21Structure | null {
  const period = 21;

  if (ohlcData.length < period) {
    console.warn(`[Calculations] Need at least ${period} bars for 21EMA structure`);
    return null;
  }

  // Extract price series as Decimals
  const highs = ohlcData.map((bar) => new Decimal(bar.high));
  const closes = ohlcData.map((bar) => new Decimal(bar.close));
  const lows = ohlcData.map((bar) => new Decimal(bar.low));

  // Calculate EMAs
  const emaHighs = calculateEMA(highs, period);
  const emaCloses = calculateEMA(closes, period);
  const emaLows = calculateEMA(lows, period);

  // Get current values (last in array)
  const lastIndex = ohlcData.length - 1;
  const maHigh = emaHighs[lastIndex];
  const maClose = emaCloses[lastIndex];
  const maLow = emaLows[lastIndex];
  const currentClose = closes[lastIndex];

  // Determine position
  const position = getStructurePosition(currentClose, maHigh, maLow);

  // Determine slope (using last 5 days of maClose)
  const recentMaCloses = emaCloses.slice(-5);
  const slope = getStructureSlope(recentMaCloses);

  return {
    maHigh,
    maClose,
    maLow,
    currentClose,
    position,
    slope,
  };
}

/**
 * Determine position relative to EMA cloud
 * @param close - Current close price
 * @param maHigh - 21EMA of highs (top of cloud)
 * @param maLow - 21EMA of lows (bottom of cloud)
 * @returns Position: above_cloud, inside_cloud, or below_cloud
 */
export function getStructurePosition(
  close: Decimal,
  maHigh: Decimal,
  maLow: Decimal
): StructurePosition {
  if (close.gt(maHigh)) {
    return 'above_cloud';
  } else if (close.lt(maLow)) {
    return 'below_cloud';
  } else {
    return 'inside_cloud';
  }
}

/**
 * Determine slope of EMA based on recent history
 * @param maCloseHistory - Recent 21EMA close values (oldest first)
 * @returns Slope: rising, flat, or falling
 */
export function getStructureSlope(maCloseHistory: Decimal[]): StructureSlope {
  if (maCloseHistory.length < 2) {
    return 'flat';
  }

  const first = maCloseHistory[0];
  const last = maCloseHistory[maCloseHistory.length - 1];

  // Calculate percentage change
  const change = last.minus(first).div(first).times(100);

  // Threshold for flat: less than 0.5% change over the period
  const flatThreshold = new Decimal(0.5);

  if (change.gt(flatThreshold)) {
    return 'rising';
  } else if (change.lt(flatThreshold.neg())) {
    return 'falling';
  } else {
    return 'flat';
  }
}

/**
 * Calculate ATR (Average True Range)
 * @param ohlcData - Array of OHLC data (oldest first)
 * @param period - ATR period (default 14)
 * @returns Current ATR value
 */
export function calculateATR(ohlcData: OHLCData[], period = 14): Decimal {
  if (ohlcData.length < period + 1) {
    console.warn(`[Calculations] Need at least ${period + 1} bars for ATR`);
    return new Decimal(0);
  }

  const trueRanges: Decimal[] = [];

  for (let i = 1; i < ohlcData.length; i++) {
    const current = ohlcData[i];
    const prev = ohlcData[i - 1];

    const highLow = new Decimal(current.high).minus(current.low);
    const highPrevClose = new Decimal(current.high).minus(prev.close).abs();
    const lowPrevClose = new Decimal(current.low).minus(prev.close).abs();

    const trueRange = Decimal.max(highLow, highPrevClose, lowPrevClose);
    trueRanges.push(trueRange);
  }

  // Calculate ATR using EMA of true ranges
  const atrValues = calculateEMA(trueRanges, period);
  return atrValues[atrValues.length - 1];
}

/**
 * Calculate distance from price to 21EMA in ATR units
 * @param price - Current price
 * @param ema21 - 21EMA value
 * @param atr - ATR value
 * @returns Distance in ATR units (positive = above, negative = below)
 */
export function calculateDistanceToEMA(
  price: Decimal,
  ema21: Decimal,
  atr: Decimal
): Decimal {
  if (atr.isZero()) {
    return new Decimal(0);
  }
  return price.minus(ema21).div(atr);
}
