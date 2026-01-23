/**
 * Task 9 — Overview Navigation + Trades Today
 *
 * Generates overview data for dashboard navigation and recent trade fills.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Features:
 * - Navigation items for all dashboard panels
 * - Trades Today: fills from last 24h in trade ticket format
 * - Trade statistics (buys, sells, volume)
 *
 * @see agent_tasks.md Task 9
 * @see agent_ui_contract.md Panel 5
 */

import Decimal from 'decimal.js';
import {
  OverviewOutput,
  TradeRecord,
  TradeAction,
  TradeActionType,
  NavItem,
  TradeStats,
} from '@/types';

// =============================================================================
// Input Types
// =============================================================================

/**
 * Raw trade fill from broker/database
 */
export interface RawTradeFill {
  /** Trade timestamp (ISO string) */
  timestamp: string;
  /** Stock ticker symbol */
  ticker: string;
  /** Trade side */
  side: 'BUY' | 'SELL';
  /** Action type */
  action_type: TradeActionType;
  /** Number of shares */
  shares: number;
  /** Execution price */
  price: number;
  /** Trade notes/reason */
  notes?: string;
  /** R multiple at time of trade */
  r_multiple?: number;
  /** Entry mode (for entries) */
  mode?: string;
}

/**
 * Overview configuration
 */
export interface OverviewConfig {
  /** Hours to look back for trades (default: 24) */
  lookback_hours?: number;
  /** Include the new "Suggested Trades" nav item */
  include_suggested_trades?: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default overview configuration
 */
export const DEFAULT_OVERVIEW_CONFIG: Required<OverviewConfig> = {
  lookback_hours: 24,
  include_suggested_trades: true,
};

/**
 * Default navigation items (without Suggested Trades)
 */
const BASE_NAV_ITEMS: NavItem[] = [
  'Market State',
  'Liquid Leaders',
  'Pullback Scan',
  'Focus List',
  'Trades Today',
  'Portfolio',
];

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
// Navigation
// =============================================================================

/**
 * Get default navigation items
 *
 * @param includeSuggestedTrades - Include "Suggested Trades" panel
 * @returns Array of navigation items
 */
export function getDefaultNavItems(includeSuggestedTrades: boolean = true): NavItem[] {
  if (includeSuggestedTrades) {
    // Insert "Suggested Trades" after "Focus List" (index 4)
    const items = [...BASE_NAV_ITEMS];
    items.splice(4, 0, 'Suggested Trades' as NavItem);
    return items;
  }
  return [...BASE_NAV_ITEMS];
}

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Format timestamp to HH:MM UTC format
 */
function formatTimeUtc(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '--:--';
  }
}

/**
 * Parse timestamp to Date object
 */
function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

// =============================================================================
// Trade Filtering
// =============================================================================

/**
 * Filter trades to last N hours
 *
 * @param trades - All trade fills
 * @param hours - Number of hours to look back
 * @returns Filtered trades within the time window
 */
export function filterRecentTrades(
  trades: RawTradeFill[],
  hours: number
): RawTradeFill[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);

  return trades.filter(trade => {
    const tradeTime = parseTimestamp(trade.timestamp);
    return tradeTime >= cutoff;
  });
}

// =============================================================================
// Trade Note Generation
// =============================================================================

/**
 * Generate trade note from action type and context
 *
 * @param actionType - Type of trade action
 * @param rMultiple - R multiple at trade (for exits/trims)
 * @param mode - Entry mode (for entries)
 * @returns Human-readable trade note
 */
export function generateTradeNote(
  actionType: TradeActionType,
  rMultiple?: number,
  mode?: string
): string {
  switch (actionType) {
    case 'ENTRY':
      if (mode) {
        return `${mode} entry — new position`;
      }
      return 'New position entry';

    case 'ADD':
      return 'Add to existing position';

    case 'TRIM':
      if (rMultiple !== undefined) {
        const rStr = rMultiple >= 0 ? `+${rMultiple.toFixed(1)}R` : `${rMultiple.toFixed(1)}R`;
        if (rMultiple >= 2) {
          return `1/3 off at ${rStr} (2R trim)`;
        }
        return `Trim at ${rStr}`;
      }
      return 'Position trim';

    case 'EXIT':
      if (rMultiple !== undefined) {
        const rStr = rMultiple >= 0 ? `+${rMultiple.toFixed(1)}R` : `${rMultiple.toFixed(1)}R`;
        if (rMultiple < 0) {
          return `Exit at ${rStr} — stop triggered`;
        }
        return `Full exit at ${rStr}`;
      }
      return 'Position exit';

    default:
      return '';
  }
}

// =============================================================================
// Trade Record Conversion
// =============================================================================

/**
 * Convert raw trade fill to TradeRecord format
 *
 * @param fill - Raw trade fill from broker
 * @returns Formatted TradeRecord for display
 */
export function toTradeRecord(fill: RawTradeFill): TradeRecord {
  // Use provided notes or generate from context
  const notes = fill.notes ?? generateTradeNote(
    fill.action_type,
    fill.r_multiple,
    fill.mode
  );

  return {
    time_utc: formatTimeUtc(fill.timestamp),
    action: fill.side,
    ticker: fill.ticker,
    shares: fill.shares,
    price: fill.price,
    notes,
    action_type: fill.action_type,
    r_multiple: fill.r_multiple,
    mode: fill.mode,
  };
}

// =============================================================================
// Trade Sorting
// =============================================================================

/**
 * Sort trades by time (most recent first)
 *
 * @param trades - Array of trade records
 * @returns Sorted array (descending by time)
 */
export function sortTradesByTime(trades: TradeRecord[]): TradeRecord[] {
  return [...trades].sort((a, b) => {
    // Compare HH:MM strings (works for same-day trades)
    return b.time_utc.localeCompare(a.time_utc);
  });
}

/**
 * Sort raw trades by timestamp (most recent first)
 */
function sortRawTradesByTime(trades: RawTradeFill[]): RawTradeFill[] {
  return [...trades].sort((a, b) => {
    const timeA = parseTimestamp(a.timestamp).getTime();
    const timeB = parseTimestamp(b.timestamp).getTime();
    return timeB - timeA;
  });
}

// =============================================================================
// Trade Statistics
// =============================================================================

/**
 * Calculate trade statistics
 *
 * @param trades - Array of trade records
 * @returns Trade statistics summary
 */
export function calculateTradeStats(trades: TradeRecord[]): TradeStats {
  let buys = 0;
  let sells = 0;
  let volume = new Decimal(0);

  for (const trade of trades) {
    if (trade.action === 'BUY') {
      buys++;
    } else {
      sells++;
    }

    const tradeValue = toDecimal(trade.shares).times(trade.price);
    volume = volume.plus(tradeValue);
  }

  return {
    total: trades.length,
    buys,
    sells,
    volume: volume.toNumber(),
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 9 — Overview Navigation + Trades Today
 *
 * Generates overview data including navigation and recent trade fills.
 *
 * @param trades - Raw trade fills from broker/database
 * @param config - Overview configuration
 * @returns OverviewOutput with nav and trades_today
 *
 * @example
 * ```typescript
 * const overview = generateOverview(rawTrades, {
 *   lookback_hours: 24,
 *   include_suggested_trades: true,
 * });
 *
 * console.log(overview.nav);
 * // ['Market State', 'Liquid Leaders', ..., 'Portfolio']
 *
 * console.log(overview.trades_today[0]);
 * // { time_utc: '15:52', action: 'BUY', ticker: 'NVDA', ... }
 * ```
 */
export function generateOverview(
  trades: RawTradeFill[],
  config?: OverviewConfig
): OverviewOutput {
  const mergedConfig: Required<OverviewConfig> = {
    ...DEFAULT_OVERVIEW_CONFIG,
    ...config,
  };

  // Get navigation items
  const nav = getDefaultNavItems(mergedConfig.include_suggested_trades);

  // Filter to recent trades
  const recentTrades = filterRecentTrades(trades, mergedConfig.lookback_hours);

  // Sort by time (most recent first)
  const sortedTrades = sortRawTradesByTime(recentTrades);

  // Convert to TradeRecord format
  const tradestoday = sortedTrades.map(toTradeRecord);

  return {
    task: 'overview',
    nav,
    trades_today: tradestoday,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get trades by ticker
 */
export function getTradesByTicker(
  overview: OverviewOutput,
  ticker: string
): TradeRecord[] {
  return overview.trades_today.filter(t => t.ticker === ticker);
}

/**
 * Get trades by action type
 */
export function getTradesByAction(
  overview: OverviewOutput,
  action: TradeAction
): TradeRecord[] {
  return overview.trades_today.filter(t => t.action === action);
}

/**
 * Get trades by action subtype
 */
export function getTradesByActionType(
  overview: OverviewOutput,
  actionType: TradeActionType
): TradeRecord[] {
  return overview.trades_today.filter(t => t.action_type === actionType);
}

/**
 * Get entry trades only
 */
export function getEntryTrades(overview: OverviewOutput): TradeRecord[] {
  return overview.trades_today.filter(t => t.action_type === 'ENTRY');
}

/**
 * Get trim trades only
 */
export function getTrimTrades(overview: OverviewOutput): TradeRecord[] {
  return overview.trades_today.filter(t => t.action_type === 'TRIM');
}

/**
 * Get exit trades only
 */
export function getExitTrades(overview: OverviewOutput): TradeRecord[] {
  return overview.trades_today.filter(t => t.action_type === 'EXIT');
}

/**
 * Check if there are any trades today
 */
export function hasTradesToday(overview: OverviewOutput): boolean {
  return overview.trades_today.length > 0;
}

/**
 * Get unique tickers traded today
 */
export function getTickersTraded(overview: OverviewOutput): string[] {
  const tickers = new Set(overview.trades_today.map(t => t.ticker));
  return Array.from(tickers);
}

/**
 * Calculate total dollar volume traded
 */
export function getTotalVolume(overview: OverviewOutput): number {
  return overview.trades_today.reduce((acc, t) => {
    return acc + (t.shares * t.price);
  }, 0);
}

/**
 * Format overview as summary text
 * Useful for logging or notifications
 */
export function formatOverviewSummary(overview: OverviewOutput): string {
  const stats = calculateTradeStats(overview.trades_today);
  const lines: string[] = [
    `=== Trades Today Summary ===`,
    `Total Trades: ${stats.total}`,
    `Buys: ${stats.buys}`,
    `Sells: ${stats.sells}`,
    `Volume: $${(stats.volume ?? 0).toLocaleString()}`,
    ``,
  ];

  if (overview.trades_today.length > 0) {
    lines.push(`--- Recent Trades ---`);
    for (const t of overview.trades_today) {
      const rStr = t.r_multiple !== undefined
        ? ` (${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple.toFixed(1)}R)`
        : '';
      lines.push(
        `${t.time_utc} ${t.action} ${t.shares} ${t.ticker} @ $${t.price.toFixed(2)}${rStr}`
      );
      if (t.notes) {
        lines.push(`         → ${t.notes}`);
      }
    }
  } else {
    lines.push('No trades today.');
  }

  return lines.join('\n');
}

/**
 * Validate overview data integrity
 */
export function validateOverview(overview: OverviewOutput): boolean {
  // Check nav has required items
  if (overview.nav.length < 6) {
    return false;
  }

  // Check each trade has required fields
  for (const trade of overview.trades_today) {
    if (!trade.ticker || !trade.action || trade.shares <= 0 || trade.price <= 0) {
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
  formatTimeUtc,
  parseTimestamp,
  sortRawTradesByTime,
  BASE_NAV_ITEMS,
};
