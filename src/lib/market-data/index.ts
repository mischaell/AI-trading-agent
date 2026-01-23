/**
 * Market Data Module
 *
 * Re-exports all market data utilities for easy importing.
 *
 * @example
 * import {
 *   fetchQQQE,
 *   fetchQuote,
 *   calculate21EMAStructure,
 *   getBreadthData,
 *   saveBreadthData,
 * } from '@/lib/market-data';
 */

// Yahoo Finance Client
export {
  fetchOHLC,
  fetchQuote,
  fetchBatchQuotes,
  fetchQQQE,
  fetchSPY,
  clearCache,
  getCacheStats,
  type OHLCData,
  type QuoteData,
} from './client';

// Calculations
export {
  calculateEMA,
  calculate21EMAStructure,
  getStructurePosition,
  getStructureSlope,
  calculateATR,
  calculateDistanceToEMA,
  type StructurePosition,
  type StructureSlope,
  type EMA21Structure,
} from './calculations';

// Breadth Data
export {
  getBreadthData,
  getBreadthDataByDate,
  saveBreadthData,
  getBreadthHistory,
  hasTodayBreadthData,
  type BreadthData,
} from './breadth';

// Universe Data
export {
  getNasdaq100Tickers,
  fetchTickerData,
  fetchUniverseData,
  fetchUniverseDataBatch,
  CHINA_ADRS,
  TICKER_THEMES,
  type UniverseTickerData,
} from './universe';

// Relative Strength
export {
  calculatePerformanceMetrics,
  calculateRSRatings,
  fetchTickerRS,
  fetchBatchRS,
  type RSData,
  type PriceHistory,
} from './relative-strength';

// Ticker Structure Analysis
export {
  analyzeStructure,
  analyzeTickerStructure,
  batchAnalyzeTickers,
  clearAnalysisCache,
  type OHLCBar,
  type TickerStructureAnalysis,
} from './ticker-analysis';
