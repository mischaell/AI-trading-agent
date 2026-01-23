/**
 * Discord #equity-trades Channel Parser
 *
 * Parses trade execution messages from Discord into structured trade data.
 *
 * Supported formats:
 * - ENTRY: "Long 11% NBIS @ 98.22 (SSL @ 94.03) (EC risk : -0.49%) (1/3 at 2R @ 106.6)"
 * - ADD:   "ADD 3% ALAB @ 181.19 (SSL @ 164.18) (EC risk : -0.28%)"
 * - TRIM:  "Trimmed 1/3 IREN (1/9) @ 22.34% (57.17) - 2R"
 * - CLOSE: "Closed NBIS (1/21) @ -4.6% (93.62)"
 * - STOP:  "Stopped out NVDA @ -1R (138.50)"
 *
 * @module discord/parsers/equity-trades
 */

import Decimal from "decimal.js";

// =============================================================================
// Types
// =============================================================================

export type TradeAction = "ENTRY" | "ADD" | "TRIM" | "CLOSE" | "STOP_OUT";
export type TradeSide = "Long" | "Short";

export interface ParsedEquityTrade {
  action: TradeAction;
  side: TradeSide;
  ticker: string;

  // Entry/Add details
  position_pct?: number;
  entry_price?: number;
  ssl?: number;
  ec_risk_pct?: number;
  trim_fraction?: string;
  trim_target_r?: number;
  trim_target_price?: number;

  // Exit/Trim details
  exit_price?: number;
  gain_pct?: number;
  r_multiple?: number;
  trade_date?: string; // MM/DD format parsed to ISO

  // Metadata
  raw_message: string;
  parsed_at: string;
  confidence: number; // 0-1 parsing confidence
}

export interface ParseResult {
  success: boolean;
  trade?: ParsedEquityTrade;
  error?: string;
}

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * ENTRY Pattern
 * Example: "Long 11% NBIS @ 98.22 (SSL @ 94.03) (EC risk : -0.49%) (1/3 at 2R @ 106.6)"
 *
 * Captures:
 * 1. Side (Long/Short)
 * 2. Position % (11)
 * 3. Ticker (NBIS)
 * 4. Entry price (98.22)
 * 5. SSL price (94.03)
 * 6. EC risk % (-0.49)
 * 7. Trim fraction (1/3) - optional
 * 8. Trim R target (2) - optional
 * 9. Trim price (106.6) - optional
 */
const ENTRY_PATTERN =
  /^(Long|Short)\s+(\d+(?:\.\d+)?)\s*%?\s+([A-Z]{1,5})\s*@\s*(\d+(?:\.\d+)?)\s*\(SSL\s*@\s*(\d+(?:\.\d+)?)\)\s*\(EC\s*risk\s*:\s*(-?\d+(?:\.\d+)?)\s*%?\)(?:\s*\((\d+\/\d+)\s*at\s*(\d+(?:\.\d+)?)R\s*@\s*(\d+(?:\.\d+)?)\))?/i;

/**
 * ADD Pattern
 * Example: "ADD 3% ALAB @ 181.19 (SSL @ 164.18) (EC risk : -0.28%)"
 *
 * Captures:
 * 1. Position % (3)
 * 2. Ticker (ALAB)
 * 3. Entry price (181.19)
 * 4. SSL price (164.18)
 * 5. EC risk % (-0.28)
 */
const ADD_PATTERN =
  /^ADD\s+(\d+(?:\.\d+)?)\s*%?\s+([A-Z]{1,5})\s*@\s*(\d+(?:\.\d+)?)\s*\(SSL\s*@\s*(\d+(?:\.\d+)?)\)\s*\(EC\s*risk\s*:\s*(-?\d+(?:\.\d+)?)\s*%?\)/i;

/**
 * TRIM Pattern
 * Example: "Trimmed 1/3 IREN (1/9) @ 22.34% (57.17) - 2R"
 *
 * Captures:
 * 1. Trim fraction (1/3)
 * 2. Ticker (IREN)
 * 3. Trade date (1/9)
 * 4. Gain % (22.34)
 * 5. Exit price (57.17)
 * 6. R multiple (2)
 */
const TRIM_PATTERN =
  /^Trimmed?\s+(\d+\/\d+)\s+([A-Z]{1,5})\s*\((\d+\/\d+)\)\s*@\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*\((\d+(?:\.\d+)?)\)\s*-?\s*(\d+(?:\.\d+)?)R?/i;

/**
 * CLOSE Pattern
 * Example: "Closed NBIS (1/21) @ -4.6% (93.62)"
 *
 * Captures:
 * 1. Ticker (NBIS)
 * 2. Trade date (1/21)
 * 3. Gain % (-4.6)
 * 4. Exit price (93.62)
 */
const CLOSE_PATTERN =
  /^Closed?\s+([A-Z]{1,5})\s*\((\d+\/\d+)\)\s*@\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*\((\d+(?:\.\d+)?)\)/i;

/**
 * STOP OUT Pattern
 * Example: "Stopped out NVDA @ -1R (138.50)"
 *
 * Captures:
 * 1. Ticker (NVDA)
 * 2. R multiple (-1)
 * 3. Exit price (138.50)
 */
const STOP_PATTERN =
  /^Stopped?\s*out\s+([A-Z]{1,5})\s*@\s*([+-]?\d+(?:\.\d+)?)R?\s*\((\d+(?:\.\d+)?)\)/i;

/**
 * Alternative ENTRY Pattern (simpler format)
 * Example: "Bought NVDA @ 142.50"
 */
const SIMPLE_ENTRY_PATTERN =
  /^(?:Bought|Entered|Long)\s+([A-Z]{1,5})\s*@\s*(\d+(?:\.\d+)?)/i;

/**
 * Alternative CLOSE Pattern (simpler format)
 * Example: "Sold NVDA @ 155.00 (+8.8%)"
 */
const SIMPLE_CLOSE_PATTERN =
  /^(?:Sold|Exited|Closed)\s+([A-Z]{1,5})\s*@\s*(\d+(?:\.\d+)?)\s*\(([+-]?\d+(?:\.\d+)?)\s*%?\)/i;

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Parse an ENTRY message
 */
function parseEntry(message: string): ParseResult {
  const match = message.match(ENTRY_PATTERN);
  if (!match) {
    // Try simple format
    const simpleMatch = message.match(SIMPLE_ENTRY_PATTERN);
    if (simpleMatch) {
      return {
        success: true,
        trade: {
          action: "ENTRY",
          side: "Long",
          ticker: simpleMatch[1].toUpperCase(),
          entry_price: parseFloat(simpleMatch[2]),
          raw_message: message,
          parsed_at: new Date().toISOString(),
          confidence: 0.6, // Lower confidence for simple format
        },
      };
    }
    return { success: false, error: "Does not match ENTRY pattern" };
  }

  const trade: ParsedEquityTrade = {
    action: "ENTRY",
    side: match[1] as TradeSide,
    ticker: match[3].toUpperCase(),
    position_pct: parseFloat(match[2]),
    entry_price: parseFloat(match[4]),
    ssl: parseFloat(match[5]),
    ec_risk_pct: parseFloat(match[6]),
    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0.95,
  };

  // Optional trim target
  if (match[7] && match[8] && match[9]) {
    trade.trim_fraction = match[7];
    trade.trim_target_r = parseFloat(match[8]);
    trade.trim_target_price = parseFloat(match[9]);
  }

  return { success: true, trade };
}

/**
 * Parse an ADD message
 */
function parseAdd(message: string): ParseResult {
  const match = message.match(ADD_PATTERN);
  if (!match) {
    return { success: false, error: "Does not match ADD pattern" };
  }

  const trade: ParsedEquityTrade = {
    action: "ADD",
    side: "Long",
    ticker: match[2].toUpperCase(),
    position_pct: parseFloat(match[1]),
    entry_price: parseFloat(match[3]),
    ssl: parseFloat(match[4]),
    ec_risk_pct: parseFloat(match[5]),
    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0.95,
  };

  return { success: true, trade };
}

/**
 * Parse a TRIM message
 */
function parseTrim(message: string): ParseResult {
  const match = message.match(TRIM_PATTERN);
  if (!match) {
    return { success: false, error: "Does not match TRIM pattern" };
  }

  const trade: ParsedEquityTrade = {
    action: "TRIM",
    side: "Long",
    ticker: match[2].toUpperCase(),
    trim_fraction: match[1],
    trade_date: parseTradeDate(match[3]),
    gain_pct: parseFloat(match[4]),
    exit_price: parseFloat(match[5]),
    r_multiple: parseFloat(match[6]),
    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0.95,
  };

  return { success: true, trade };
}

/**
 * Parse a CLOSE message
 */
function parseClose(message: string): ParseResult {
  const match = message.match(CLOSE_PATTERN);
  if (!match) {
    // Try simple format
    const simpleMatch = message.match(SIMPLE_CLOSE_PATTERN);
    if (simpleMatch) {
      return {
        success: true,
        trade: {
          action: "CLOSE",
          side: "Long",
          ticker: simpleMatch[1].toUpperCase(),
          exit_price: parseFloat(simpleMatch[2]),
          gain_pct: parseFloat(simpleMatch[3]),
          raw_message: message,
          parsed_at: new Date().toISOString(),
          confidence: 0.7,
        },
      };
    }
    return { success: false, error: "Does not match CLOSE pattern" };
  }

  const trade: ParsedEquityTrade = {
    action: "CLOSE",
    side: "Long",
    ticker: match[1].toUpperCase(),
    trade_date: parseTradeDate(match[2]),
    gain_pct: parseFloat(match[3]),
    exit_price: parseFloat(match[4]),
    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0.95,
  };

  return { success: true, trade };
}

/**
 * Parse a STOP OUT message
 */
function parseStopOut(message: string): ParseResult {
  const match = message.match(STOP_PATTERN);
  if (!match) {
    return { success: false, error: "Does not match STOP_OUT pattern" };
  }

  const trade: ParsedEquityTrade = {
    action: "STOP_OUT",
    side: "Long",
    ticker: match[1].toUpperCase(),
    r_multiple: parseFloat(match[2]),
    exit_price: parseFloat(match[3]),
    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0.95,
  };

  return { success: true, trade };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse trade date (MM/DD) to ISO string
 * Assumes current year, adjusts for year boundary
 */
function parseTradeDate(dateStr: string): string {
  const [month, day] = dateStr.split("/").map(Number);
  const now = new Date();
  let year = now.getFullYear();

  // If month is > current month by a lot, assume previous year
  if (month > now.getMonth() + 1 + 6) {
    year--;
  }

  const date = new Date(year, month - 1, day);
  return date.toISOString().split("T")[0];
}

/**
 * Clean message text before parsing
 */
function cleanMessage(message: string): string {
  return message
    .trim()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[""]/g, '"') // Normalize quotes
    .replace(/[']/g, "'");
}

/**
 * Detect the type of trade message
 */
function detectTradeType(message: string): TradeAction | null {
  const cleanMsg = message.toLowerCase();

  if (/^long\s/i.test(message) || /^short\s/i.test(message)) {
    return "ENTRY";
  }
  if (/^add\s/i.test(message)) {
    return "ADD";
  }
  if (/^trimmed?\s/i.test(message)) {
    return "TRIM";
  }
  if (/^closed?\s/i.test(message)) {
    return "CLOSE";
  }
  if (/^stopped?\s*out\s/i.test(message)) {
    return "STOP_OUT";
  }
  if (/^bought\s/i.test(message) || /^entered\s/i.test(message)) {
    return "ENTRY";
  }
  if (/^sold\s/i.test(message) || /^exited\s/i.test(message)) {
    return "CLOSE";
  }

  return null;
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse an equity trade message from Discord
 *
 * @param message - Raw message content
 * @returns ParseResult with parsed trade or error
 */
export function parseEquityTrade(message: string): ParseResult {
  const cleaned = cleanMessage(message);
  const tradeType = detectTradeType(cleaned);

  if (!tradeType) {
    return {
      success: false,
      error: "Could not detect trade type from message",
    };
  }

  switch (tradeType) {
    case "ENTRY":
      return parseEntry(cleaned);
    case "ADD":
      return parseAdd(cleaned);
    case "TRIM":
      return parseTrim(cleaned);
    case "CLOSE":
      return parseClose(cleaned);
    case "STOP_OUT":
      return parseStopOut(cleaned);
    default:
      return { success: false, error: `Unknown trade type: ${tradeType}` };
  }
}

/**
 * Parse multiple messages, returning only successful parses
 */
export function parseEquityTrades(messages: string[]): ParsedEquityTrade[] {
  const trades: ParsedEquityTrade[] = [];

  for (const msg of messages) {
    const result = parseEquityTrade(msg);
    if (result.success && result.trade) {
      trades.push(result.trade);
    }
  }

  return trades;
}

/**
 * Validate a parsed trade has required fields based on action
 */
export function validateParsedTrade(trade: ParsedEquityTrade): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // All trades need ticker and action
  if (!trade.ticker) errors.push("Missing ticker");
  if (!trade.action) errors.push("Missing action");

  // Action-specific validation
  switch (trade.action) {
    case "ENTRY":
    case "ADD":
      if (!trade.entry_price) errors.push("Missing entry_price");
      if (!trade.ssl) errors.push("Missing ssl");
      if (trade.entry_price && trade.ssl) {
        // SSL should be below entry for Long
        if (trade.side === "Long" && trade.ssl >= trade.entry_price) {
          errors.push("SSL should be below entry price for Long");
        }
      }
      break;

    case "TRIM":
    case "CLOSE":
      if (!trade.exit_price) errors.push("Missing exit_price");
      break;

    case "STOP_OUT":
      if (!trade.exit_price) errors.push("Missing exit_price");
      if (trade.r_multiple === undefined) errors.push("Missing r_multiple");
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Test the parser with sample messages
 */
export function testParser(): void {
  const testCases = [
    // ENTRY
    'Long 11% NBIS @ 98.22 (SSL @ 94.03) (EC risk : -0.49%) (1/3 at 2R @ 106.6)',
    'Long 12% ALAB @ 181.19 (SSL @ 164.18) (EC risk : -0.52%)',
    'Short 10% SPY @ 450.00 (SSL @ 455.00) (EC risk : -0.25%)',

    // ADD
    'ADD 3% ALAB @ 181.19 (SSL @ 164.18) (EC risk : -0.28%)',
    'ADD 5% NVDA @ 142.50 (SSL @ 138.00) (EC risk : -0.35%)',

    // TRIM
    'Trimmed 1/3 IREN (1/9) @ 22.34% (57.17) - 2R',
    'Trimmed 1/3 ALAB (1/15) @ 15.5% (209.34) - 2R',

    // CLOSE
    'Closed NBIS (1/21) @ -4.6% (93.62)',
    'Closed IREN (1/20) @ +18.2% (55.40)',

    // STOP OUT
    'Stopped out NVDA @ -1R (138.50)',
    'Stopped out META @ -0.8R (520.00)',

    // Simple formats
    'Bought NVDA @ 142.50',
    'Sold NVDA @ 155.00 (+8.8%)',
  ];

  console.log("=".repeat(70));
  console.log("Equity Trades Parser Test");
  console.log("=".repeat(70));
  console.log();

  for (const msg of testCases) {
    const result = parseEquityTrade(msg);
    console.log(`Message: "${msg}"`);
    if (result.success && result.trade) {
      console.log(`  ✓ Parsed: ${result.trade.action} ${result.trade.ticker}`);
      console.log(`    ${JSON.stringify(result.trade, null, 2).split("\n").slice(1, -1).join("\n    ")}`);
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
    }
    console.log();
  }
}

// =============================================================================
// Exports
// =============================================================================

export default {
  parseEquityTrade,
  parseEquityTrades,
  validateParsedTrade,
  testParser,
};
