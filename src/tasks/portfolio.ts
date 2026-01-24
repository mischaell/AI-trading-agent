/**
 * Task 8 — Portfolio (Create / Update / Display)
 *
 * Manages positions and computes portfolio aggregates.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Position tracking:
 * - SSL (21EMA low band)
 * - Trimmed % (how much has been trimmed at 2R)
 * - Secured P&L (realized from trims)
 * - Open heat (unrealized P&L)
 * - R multiple (current price vs entry in R terms)
 * - EC risk % (exposure at risk)
 *
 * Portfolio aggregates:
 * - Gross exposure (% of equity invested)
 * - NER (new exposure risk - sum of EC risk %)
 * - Open heat (total unrealized P&L %)
 * - Secured profits (total realized P&L %)
 * - Position count
 *
 * @see agent_tasks.md Task 8
 * @see agent_ui_contract.md Panel 6
 */

import Decimal from 'decimal.js';
import {
  PortfolioOutput,
  PortfolioSummary,
  PortfolioPosition,
  PositionStatus,
  TrimRecommendation,
} from '@/types';

// =============================================================================
// Input Types
// =============================================================================

/**
 * Raw position data from broker/database
 */
export interface RawPosition {
  /** Stock ticker symbol */
  ticker: string;
  /** Current shares held */
  shares: number;
  /** Average entry price */
  avg_price: number;
  /** Current market price */
  last_price: number;
  /** Current 21EMA low band (SSL) */
  ssl: number;
  /** 2R target price */
  trim_2r_price: number;
  /** Original entry shares (before trims) */
  original_shares?: number;
  /** Days until earnings */
  earnings_days?: number;
  /** Distance to 21EMA in ATR */
  dist_21_atr?: number;
  /** Sector/theme */
  theme?: string;
  /** Entry mode (MODE1 or MODE2) */
  mode?: 'MODE1' | 'MODE2';
  /** Position status from database */
  status?: PositionStatus;
  /** Percentage already trimmed */
  trimmed_pct?: number;
}

/**
 * Trade record from last 24h
 */
export interface RecentTrade {
  /** Stock ticker symbol */
  ticker: string;
  /** Trade side */
  side: 'BUY' | 'SELL';
  /** Trade action type */
  action: 'ENTRY' | 'TRIM' | 'EXIT' | 'ADD';
  /** Number of shares */
  shares: number;
  /** Execution price */
  price: number;
  /** Trade timestamp (ISO string) */
  timestamp: string;
  /** R multiple at time of trade (for exits/trims) */
  r_multiple?: number;
}

/**
 * Account context for portfolio calculations
 */
export interface AccountContext {
  /** Total equity in dollars */
  equity: number;
  /** Cash available in dollars */
  cash: number;
}

/**
 * Portfolio calculation configuration
 */
export interface PortfolioConfig {
  /** Threshold for RUNNER status (default: 2.0 R) */
  runner_r_threshold?: number;
  /** Threshold for CORE status (default: 1.0 R) */
  core_r_threshold?: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default portfolio configuration
 */
export const DEFAULT_PORTFOLIO_CONFIG: Required<PortfolioConfig> = {
  runner_r_threshold: 2.0,
  core_r_threshold: 1.0,
};

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
// Position Status
// =============================================================================

/**
 * Determine position status based on R multiple
 *
 * - STARTER: R < 1.0 (new position, not yet at 1R)
 * - CORE: 1.0 <= R < 2.0 (established position)
 * - RUNNER: R >= 2.0 (winning position, let it run)
 */
export function determinePositionStatus(
  rMultiple: Decimal,
  config: Required<PortfolioConfig>
): PositionStatus {
  if (rMultiple.gte(config.runner_r_threshold)) {
    return 'RUNNER';
  }
  if (rMultiple.gte(config.core_r_threshold)) {
    return 'CORE';
  }
  return 'STARTER';
}

// =============================================================================
// Trade Analysis
// =============================================================================

/**
 * Get trades for a specific ticker
 */
function getTickerTrades(ticker: string, trades: RecentTrade[]): RecentTrade[] {
  return trades.filter(t => t.ticker === ticker);
}

/**
 * Get trim trades for a ticker
 */
function getTrimTrades(ticker: string, trades: RecentTrade[]): RecentTrade[] {
  return trades.filter(t => t.ticker === ticker && t.action === 'TRIM');
}

/**
 * Calculate trimmed percentage from trades
 *
 * Trimmed % = (original shares - current shares) / original shares * 100
 */
export function calculateTrimmedPercent(
  ticker: string,
  originalShares: number,
  currentShares: number,
  trades: RecentTrade[]
): number {
  // If we have original shares, calculate directly
  if (originalShares > 0 && originalShares >= currentShares) {
    const trimmed = toDecimal(originalShares - currentShares);
    const pct = trimmed.div(originalShares).times(100);
    return pct.toNumber();
  }

  // Otherwise, calculate from trim trades
  const trimTrades = getTrimTrades(ticker, trades);
  if (trimTrades.length === 0) {
    return 0;
  }

  const totalTrimmed = trimTrades.reduce((acc, t) => acc + t.shares, 0);
  const originalFromTrades = currentShares + totalTrimmed;

  if (originalFromTrades === 0) {
    return 0;
  }

  const pct = toDecimal(totalTrimmed).div(originalFromTrades).times(100);
  return pct.toNumber();
}

/**
 * Calculate secured P&L from trim trades
 *
 * Secured P&L = sum of (trim_shares * (trim_price - avg_price)) / equity * 100
 */
export function calculateSecuredPnl(
  ticker: string,
  trades: RecentTrade[],
  avgPrice: number,
  equity: Decimal
): Decimal {
  const trimTrades = getTrimTrades(ticker, trades);

  if (trimTrades.length === 0 || equity.isZero()) {
    return new Decimal(0);
  }

  const avgPriceDec = toDecimal(avgPrice);
  let totalSecured = new Decimal(0);

  for (const trade of trimTrades) {
    const pnlPerShare = toDecimal(trade.price).minus(avgPriceDec);
    const tradePnl = pnlPerShare.times(trade.shares);
    totalSecured = totalSecured.plus(tradePnl);
  }

  // Return as percentage of equity
  return totalSecured.div(equity).times(100);
}

// =============================================================================
// Position Metrics
// =============================================================================

/**
 * Calculate R multiple for a position
 *
 * R = (current_price - entry) / (entry - ssl)
 */
function calculateRMultiple(
  lastPrice: Decimal,
  avgPrice: Decimal,
  ssl: Decimal
): Decimal {
  const rPerShare = avgPrice.minus(ssl);

  if (rPerShare.isZero() || rPerShare.isNegative()) {
    return new Decimal(0);
  }

  const pnlPerShare = lastPrice.minus(avgPrice);
  return pnlPerShare.div(rPerShare);
}

/**
 * Calculate open heat (unrealized P&L) as percentage of equity
 *
 * Open heat = (current_value - cost_basis) / equity * 100
 */
function calculateOpenHeat(
  shares: Decimal,
  lastPrice: Decimal,
  avgPrice: Decimal,
  equity: Decimal
): Decimal {
  if (equity.isZero()) {
    return new Decimal(0);
  }

  const currentValue = shares.times(lastPrice);
  const costBasis = shares.times(avgPrice);
  const unrealizedPnl = currentValue.minus(costBasis);

  return unrealizedPnl.div(equity).times(100);
}

/**
 * Calculate EC risk percentage
 *
 * EC risk = (shares * (entry - ssl)) / equity * 100
 */
function calculateEcRisk(
  shares: Decimal,
  avgPrice: Decimal,
  ssl: Decimal,
  equity: Decimal
): Decimal {
  if (equity.isZero()) {
    return new Decimal(0);
  }

  const riskPerShare = avgPrice.minus(ssl);
  const totalRisk = shares.times(riskPerShare);

  return totalRisk.div(equity).times(100);
}

/**
 * Calculate position weight as percentage of equity
 */
function calculateWeight(
  shares: Decimal,
  lastPrice: Decimal,
  equity: Decimal
): Decimal {
  if (equity.isZero()) {
    return new Decimal(0);
  }

  const positionValue = shares.times(lastPrice);
  return positionValue.div(equity).times(100);
}

/**
 * Calculate position metrics for a single position
 */
export function calculatePositionMetrics(
  position: RawPosition,
  trades: RecentTrade[],
  equity: Decimal,
  config: Required<PortfolioConfig>
): PortfolioPosition {
  const shares = toDecimal(position.shares);
  const avgPrice = toDecimal(position.avg_price);
  const lastPrice = toDecimal(position.last_price);
  const ssl = toDecimal(position.ssl);

  // Calculate metrics
  const weight = calculateWeight(shares, lastPrice, equity);
  const rMultiple = calculateRMultiple(lastPrice, avgPrice, ssl);
  const openHeat = calculateOpenHeat(shares, lastPrice, avgPrice, equity);
  const ecRisk = calculateEcRisk(shares, avgPrice, ssl, equity);

  // Calculate trimmed percentage (prefer from database, fallback to trades)
  const originalShares = position.original_shares ?? position.shares;
  const trimmedPct = position.trimmed_pct ?? calculateTrimmedPercent(
    position.ticker,
    originalShares,
    position.shares,
    trades
  );

  // Calculate secured P&L
  const securedPnl = calculateSecuredPnl(
    position.ticker,
    trades,
    position.avg_price,
    equity
  );

  // Determine status (prefer from database if available)
  const status = position.status ?? determinePositionStatus(rMultiple, config);

  // Position value
  const positionValue = shares.times(lastPrice);

  // Calculate SSL distance percentage: (lastPrice - ssl) / lastPrice * 100
  const sslDistancePct = lastPrice.gt(0)
    ? lastPrice.minus(ssl).div(lastPrice).times(100).toNumber()
    : 0;

  // Trim is available if R >= 2 and less than 33% already trimmed
  const trimAvailable = rMultiple.gte(2) && trimmedPct < 33;

  return {
    ticker: position.ticker,
    side: 'LONG',
    weight: weight.toNumber(),
    entry: position.avg_price,
    ssl: position.ssl,
    trimmed: trimmedPct,
    secured_pnl: securedPnl.toNumber(),
    open_heat: openHeat.toNumber(),
    total_r: rMultiple.toNumber(),
    ec_pct: ecRisk.toNumber(),
    status,
    last_price: position.last_price,
    value: positionValue.toNumber(),
    shares: position.shares,
    avg_price: position.avg_price,
    earnings_days: position.earnings_days,
    dist_21_atr: position.dist_21_atr,
    trim_2r_price: position.trim_2r_price,
    theme: position.theme,
    mode: position.mode,
    ssl_distance_pct: sslDistancePct,
    trim_available: trimAvailable,
  };
}

// =============================================================================
// Portfolio Summary
// =============================================================================

/**
 * Calculate portfolio summary aggregates
 */
export function calculatePortfolioSummary(
  positions: PortfolioPosition[],
  account: AccountContext
): PortfolioSummary {
  const equity = toDecimal(account.equity);

  // Sum up position metrics
  let grossExposure = new Decimal(0);
  let totalNer = new Decimal(0);
  let totalOpenHeat = new Decimal(0);
  let totalSecuredProfits = new Decimal(0);

  for (const pos of positions) {
    grossExposure = grossExposure.plus(pos.weight);
    totalNer = totalNer.plus(pos.ec_pct ?? 0);
    totalOpenHeat = totalOpenHeat.plus(pos.open_heat ?? 0);
    totalSecuredProfits = totalSecuredProfits.plus(pos.secured_pnl ?? 0);
  }

  return {
    gross_exposure: grossExposure.toNumber(),
    ner: totalNer.toNumber(),
    open_heat: totalOpenHeat.toNumber(),
    secured_profits: totalSecuredProfits.toNumber(),
    equity: account.equity,
    cash: account.cash,
    position_count: positions.length,
  };
}

// =============================================================================
// Trim Recommendations
// =============================================================================

/**
 * Generate trim recommendations for positions at 2R profit target
 *
 * Scans portfolio for positions where:
 * - R multiple >= 2.0
 * - Less than 33% already trimmed
 *
 * Returns recommendations sorted by R multiple (highest first)
 */
export function generateTrimRecommendations(
  positions: PortfolioPosition[],
  equity: number
): TrimRecommendation[] {
  return positions
    .filter(p => p.trim_available === true)
    .map(p => {
      const sharesToSell = Math.floor((p.shares ?? 0) / 3);
      const currentPrice = p.last_price ?? p.entry;
      const pnlPerShare = currentPrice - p.entry;
      const potentialPnl = sharesToSell * pnlPerShare;

      return {
        ticker: p.ticker,
        action_type: 'TRIM' as const,
        shares_to_sell: sharesToSell,
        current_shares: p.shares ?? 0,
        entry_price: p.entry,
        current_price: currentPrice,
        trim_price: p.trim_2r_price ?? p.entry,
        ssl: p.ssl,
        current_r: p.total_r ?? 0,
        potential_pnl: potentialPnl,
        potential_pnl_pct: equity > 0 ? (potentialPnl / equity) * 100 : 0,
        position: p,
      };
    })
    .sort((a, b) => b.current_r - a.current_r); // Highest R first
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 8 — Portfolio (Create / Update / Display)
 *
 * Computes portfolio positions and aggregates from raw position data
 * and recent trades.
 *
 * @param positions - Current open positions
 * @param trades - Recent trades (last 24h)
 * @param account - Account context (equity, cash)
 * @param config - Portfolio configuration
 * @returns PortfolioOutput with summary and positions
 *
 * @example
 * ```typescript
 * const portfolio = calculatePortfolio(
 *   rawPositions,
 *   recentTrades,
 *   { equity: 100000, cash: 50000 }
 * );
 *
 * console.log(portfolio.summary.gross_exposure); // 50%
 * console.log(portfolio.summary.ner); // 1.24%
 * console.log(portfolio.positions[0].total_r); // 1.5
 * ```
 */
export function calculatePortfolio(
  positions: RawPosition[],
  trades: RecentTrade[],
  account: AccountContext,
  config?: PortfolioConfig
): PortfolioOutput {
  const mergedConfig: Required<PortfolioConfig> = {
    ...DEFAULT_PORTFOLIO_CONFIG,
    ...config,
  };

  const equity = toDecimal(account.equity);

  // Calculate metrics for each position
  const portfolioPositions = positions.map(pos =>
    calculatePositionMetrics(pos, trades, equity, mergedConfig)
  );

  // Calculate summary aggregates
  const summary = calculatePortfolioSummary(portfolioPositions, account);

  // Generate trim recommendations for positions at 2R
  const trimRecommendations = generateTrimRecommendations(
    portfolioPositions,
    account.equity
  );

  // Generate timestamp
  const asOf = new Date().toISOString();

  return {
    task: 'portfolio',
    summary,
    positions: portfolioPositions,
    trim_recommendations: trimRecommendations,
    as_of: asOf,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get positions by status
 */
export function getPositionsByStatus(
  portfolio: PortfolioOutput,
  status: PositionStatus
): PortfolioPosition[] {
  return portfolio.positions.filter(p => p.status === status);
}

/**
 * Get positions with open heat above threshold
 */
export function getHotPositions(
  portfolio: PortfolioOutput,
  threshold: number = 0
): PortfolioPosition[] {
  return portfolio.positions.filter(p => (p.open_heat ?? 0) > threshold);
}

/**
 * Get positions with negative R (underwater)
 */
export function getUnderwaterPositions(
  portfolio: PortfolioOutput
): PortfolioPosition[] {
  return portfolio.positions.filter(p => (p.total_r ?? 0) < 0);
}

/**
 * Get positions approaching stop (within 1 ATR of SSL)
 */
export function getPositionsNearStop(
  portfolio: PortfolioOutput
): PortfolioPosition[] {
  return portfolio.positions.filter(p => {
    if (!p.last_price || !p.ssl) return false;
    const distToStop = p.last_price - p.ssl;
    // Consider "near stop" if within 2% of stop
    return distToStop / p.ssl < 0.02;
  });
}

/**
 * Get positions with earnings approaching
 */
export function getPositionsWithEarnings(
  portfolio: PortfolioOutput,
  withinDays: number = 7
): PortfolioPosition[] {
  return portfolio.positions.filter(p =>
    p.earnings_days !== undefined && p.earnings_days <= withinDays
  );
}

/**
 * Calculate total position value
 */
export function getTotalPositionValue(portfolio: PortfolioOutput): number {
  return portfolio.positions.reduce((acc, p) => acc + (p.value ?? 0), 0);
}

/**
 * Calculate total unrealized P&L in dollars
 */
export function getTotalUnrealizedPnl(portfolio: PortfolioOutput): number {
  const equity = portfolio.summary.equity ?? 0;
  const openHeatPct = portfolio.summary.open_heat;
  return (openHeatPct / 100) * equity;
}

/**
 * Calculate total secured P&L in dollars
 */
export function getTotalSecuredPnl(portfolio: PortfolioOutput): number {
  const equity = portfolio.summary.equity ?? 0;
  const securedPct = portfolio.summary.secured_profits;
  return (securedPct / 100) * equity;
}

/**
 * Sort positions by R multiple (highest first)
 */
export function sortByRMultiple(positions: PortfolioPosition[]): PortfolioPosition[] {
  return [...positions].sort((a, b) => (b.total_r ?? 0) - (a.total_r ?? 0));
}

/**
 * Sort positions by weight (largest first)
 */
export function sortByWeight(positions: PortfolioPosition[]): PortfolioPosition[] {
  return [...positions].sort((a, b) => b.weight - a.weight);
}

/**
 * Sort positions by EC risk (highest risk first)
 */
export function sortByRisk(positions: PortfolioPosition[]): PortfolioPosition[] {
  return [...positions].sort((a, b) => (b.ec_pct ?? 0) - (a.ec_pct ?? 0));
}

/**
 * Format portfolio summary as text
 * Useful for logging or notifications
 */
export function formatPortfolioSummary(portfolio: PortfolioOutput): string {
  const s = portfolio.summary;
  const lines: string[] = [
    `=== Portfolio Summary ===`,
    `As of: ${portfolio.as_of}`,
    `Equity: $${(s.equity ?? 0).toLocaleString()}`,
    `Cash: $${(s.cash ?? 0).toLocaleString()}`,
    `Gross Exposure: ${s.gross_exposure.toFixed(1)}%`,
    `NER: ${s.ner.toFixed(2)}%`,
    `Open Heat: ${s.open_heat >= 0 ? '+' : ''}${s.open_heat.toFixed(2)}%`,
    `Secured Profits: ${s.secured_profits.toFixed(2)}%`,
    `Positions: ${s.position_count}`,
    ``,
  ];

  if (portfolio.positions.length > 0) {
    lines.push(`--- Positions ---`);
    for (const p of portfolio.positions) {
      const rStr = (p.total_r ?? 0) >= 0 ? `+${(p.total_r ?? 0).toFixed(1)}R` : `${(p.total_r ?? 0).toFixed(1)}R`;
      lines.push(
        `${p.ticker} (${p.status}): ${p.weight.toFixed(1)}% weight, ${rStr}, ` +
        `SSL=$${p.ssl.toFixed(2)}, trimmed=${p.trimmed.toFixed(0)}%`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Validate portfolio data integrity
 */
export function validatePortfolio(portfolio: PortfolioOutput): boolean {
  // Check summary values are reasonable
  if (portfolio.summary.gross_exposure < 0 || portfolio.summary.gross_exposure > 300) {
    return false;
  }

  // Check each position
  for (const p of portfolio.positions) {
    // SSL should be below entry for long positions
    if (p.ssl >= p.entry) {
      return false;
    }
    // Weight should be positive
    if (p.weight <= 0) {
      return false;
    }
    // Trimmed should be 0-100%
    if (p.trimmed < 0 || p.trimmed > 100) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  toDecimal,
  getTickerTrades,
  getTrimTrades,
  calculateRMultiple,
  calculateOpenHeat,
  calculateEcRisk,
  calculateWeight,
};
