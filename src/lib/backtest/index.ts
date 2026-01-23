/**
 * Backtesting Module
 *
 * Provides infrastructure for backtesting the trading agent:
 * - Historical data loading from Supabase and Yahoo Finance
 * - Replay engine to run agent pipeline on historical data
 * - Outcome calculation with forward simulation
 * - Performance analysis and reporting
 *
 * @module backtest
 */

export * from "./types";
export * from "./data-loader";
export * from "./replay-engine";
export * from "./outcome-calculator";
export * from "./performance-analyzer";

export { HistoricalDataLoader } from "./data-loader";
export { ReplayEngine } from "./replay-engine";
export { OutcomeCalculator } from "./outcome-calculator";
export { PerformanceAnalyzer } from "./performance-analyzer";
