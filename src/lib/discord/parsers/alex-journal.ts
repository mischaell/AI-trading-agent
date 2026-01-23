/**
 * Discord #alex-journal Channel Parser
 *
 * Parses trading journal/reasoning entries from Discord.
 *
 * Supported formats:
 * - Entry reasoning: "NBIS long entry 21dma-structure reclaim & backtest"
 * - Exit reasoning: "Closed IREN - extended beyond 2R, taking profits"
 * - Observation: "Watching NVDA for weakness into structure"
 *
 * Mode Detection:
 * - MODE1: "weakness into structure", "pullback to 21EMA", "support test"
 * - MODE2: "reclaim & backtest", "higher low", "structure reclaim"
 *
 * @module discord/parsers/alex-journal
 */

// =============================================================================
// Types
// =============================================================================

export type JournalAction = "ENTRY" | "EXIT" | "ADD" | "TRIM" | "OBSERVATION" | "ALERT";
export type EntryMode = "MODE1" | "MODE2" | null;

export interface ParsedJournalEntry {
  ticker: string | null;
  action: JournalAction;
  setup_type: string | null;
  mode: EntryMode;
  reasoning: string;

  // Additional context
  trigger?: string;
  target?: string;
  risk_note?: string;
  chart_mentioned: boolean;

  // Metadata
  raw_message: string;
  parsed_at: string;
  confidence: number;
}

export interface JournalParseResult {
  success: boolean;
  entry?: ParsedJournalEntry;
  error?: string;
}

// =============================================================================
// Pattern Detection
// =============================================================================

/**
 * MODE1 patterns - Weakness into structure
 * These are pullback entries where price is showing weakness INTO support
 */
const MODE1_PATTERNS = [
  /weakness\s+into\s+structure/i,
  /pullback\s+to\s+21\s*(?:ema|dma)/i,
  /pullback\s+into\s+structure/i,
  /test(?:ing)?\s+(?:the\s+)?21\s*(?:ema|dma)/i,
  /support\s+test/i,
  /holding\s+(?:the\s+)?21\s*(?:ema|dma)/i,
  /bounce\s+off\s+(?:the\s+)?21\s*(?:ema|dma)/i,
  /touching\s+(?:the\s+)?structure/i,
  /at\s+(?:the\s+)?structure/i,
  /near\s+(?:the\s+)?21\s*(?:ema|dma)/i,
];

/**
 * MODE2 patterns - Reclaim and backtest (higher low)
 * These are entries after price reclaims structure and backtests
 */
const MODE2_PATTERNS = [
  /reclaim\s*(?:&|and)?\s*backtest/i,
  /higher\s+low/i,
  /structure\s+reclaim/i,
  /reclaim(?:ed|ing)?\s+(?:the\s+)?21\s*(?:ema|dma)/i,
  /back\s*test(?:ing|ed)?\s+(?:the\s+)?21\s*(?:ema|dma)/i,
  /r2g/i, // Red to Green
  /red\s*(?:to|-)\s*green/i,
  /21\s*(?:ema|dma)\s+high\s+reclaim/i,
  /breakout\s+(?:and\s+)?backtest/i,
  /hl\s+formation/i,
  /constructive\s+backtest/i,
];

/**
 * Action detection patterns
 */
const ACTION_PATTERNS: { pattern: RegExp; action: JournalAction }[] = [
  { pattern: /\b(?:long|buy|bought|entered|entry)\s+(?:entry\s+)?/i, action: "ENTRY" },
  { pattern: /\b(?:short)\s+(?:entry\s+)?/i, action: "ENTRY" },
  { pattern: /\b(?:add(?:ed|ing)?)\s+(?:to\s+)?/i, action: "ADD" },
  { pattern: /\b(?:trim(?:med|ming)?)\s+/i, action: "TRIM" },
  { pattern: /\b(?:closed?|exit(?:ed|ing)?|sold|out\s+of)\s+/i, action: "EXIT" },
  { pattern: /\b(?:watch(?:ing)?|eye(?:ing)?|monitor(?:ing)?)\s+/i, action: "OBSERVATION" },
  { pattern: /\b(?:alert|heads\s+up|note)\s*:?/i, action: "ALERT" },
];

/**
 * Setup type patterns
 */
const SETUP_PATTERNS = [
  // Structure-based setups
  { pattern: /21\s*(?:ema|dma)[- ]structure\s+reclaim\s*(?:&|and)?\s*backtest/i, setup: "21dma-structure reclaim & backtest" },
  { pattern: /21\s*(?:ema|dma)\s+reclaim\s*(?:&|and)?\s*backtest/i, setup: "21dma reclaim & backtest" },
  { pattern: /reclaim\s*(?:&|and)?\s*backtest/i, setup: "reclaim & backtest" },
  { pattern: /weakness\s+into\s+(?:21\s*(?:ema|dma)[- ])?structure/i, setup: "weakness into structure" },
  { pattern: /pullback\s+(?:to|into)\s+21\s*(?:ema|dma)/i, setup: "pullback to 21EMA" },
  { pattern: /higher\s+low\s+(?:formation|setup)?/i, setup: "higher low" },

  // Breakout setups
  { pattern: /(?:pivot|base)\s+breakout/i, setup: "pivot breakout" },
  { pattern: /range\s+breakout/i, setup: "range breakout" },
  { pattern: /cup\s*(?:&|and)?\s*handle/i, setup: "cup & handle" },
  { pattern: /vcp/i, setup: "VCP" },
  { pattern: /tight\s+(?:flag|range)/i, setup: "tight flag" },

  // Price action setups
  { pattern: /gap\s*(?:&|and)?\s*go/i, setup: "gap & go" },
  { pattern: /power\s+(?:move|bar)/i, setup: "power move" },
  { pattern: /r2g|red\s*(?:to|-)\s*green/i, setup: "R2G reversal" },
  { pattern: /shakeout\s+(?:and\s+)?recovery/i, setup: "shakeout recovery" },

  // Moving average setups
  { pattern: /10\s*(?:ema|dma)\s+(?:bounce|support)/i, setup: "10EMA bounce" },
  { pattern: /50\s*(?:ema|dma|sma)\s+(?:bounce|support)/i, setup: "50MA support" },
];

/**
 * Trigger patterns
 */
const TRIGGER_PATTERNS = [
  { pattern: /trigger[:\s]+([^,.]+)/i, group: 1 },
  { pattern: /entry\s+on[:\s]+([^,.]+)/i, group: 1 },
  { pattern: /(?:buy|enter)\s+(?:on|at)[:\s]+([^,.]+)/i, group: 1 },
  { pattern: /strength\s+reclaim/i, trigger: "strength reclaim" },
  { pattern: /r2g|red\s*(?:to|-)\s*green/i, trigger: "R2G" },
  { pattern: /21\s*(?:ema|dma)\s+high\s+reclaim/i, trigger: "21 high reclaim" },
  { pattern: /break(?:out)?\s+(?:of|above)\s+([^,.]+)/i, group: 1 },
];

/**
 * Ticker extraction pattern
 * Matches $TICKER or standalone 1-5 letter uppercase words that look like tickers
 */
const TICKER_PATTERN = /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\b(?=\s+(?:long|short|entry|exit|closed?|add|trim|watch)|\s+[-–])/gi;

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Extract ticker from message
 */
function extractTicker(message: string): string | null {
  // First try $TICKER format
  const dollarMatch = message.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch) {
    return dollarMatch[1];
  }

  // Try to find ticker before action words
  const actionMatch = message.match(/\b([A-Z]{2,5})\s+(?:long|short|entry|exit|closed?|add(?:ed)?|trim(?:med)?)/i);
  if (actionMatch) {
    return actionMatch[1];
  }

  // Try to find ticker after action words
  const afterActionMatch = message.match(/(?:long|short|entered?|bought|add(?:ed)?|closed?|exit(?:ed)?|watching)\s+([A-Z]{2,5})\b/i);
  if (afterActionMatch) {
    return afterActionMatch[1];
  }

  return null;
}

/**
 * Detect action type from message
 */
function detectAction(message: string): JournalAction {
  for (const { pattern, action } of ACTION_PATTERNS) {
    if (pattern.test(message)) {
      return action;
    }
  }
  return "OBSERVATION";
}

/**
 * Detect entry mode from message
 */
function detectMode(message: string): EntryMode {
  // Check MODE2 first (more specific patterns)
  for (const pattern of MODE2_PATTERNS) {
    if (pattern.test(message)) {
      return "MODE2";
    }
  }

  // Check MODE1
  for (const pattern of MODE1_PATTERNS) {
    if (pattern.test(message)) {
      return "MODE1";
    }
  }

  return null;
}

/**
 * Extract setup type from message
 */
function extractSetupType(message: string): string | null {
  for (const { pattern, setup } of SETUP_PATTERNS) {
    if (pattern.test(message)) {
      return setup;
    }
  }
  return null;
}

/**
 * Extract trigger from message
 */
function extractTrigger(message: string): string | null {
  for (const item of TRIGGER_PATTERNS) {
    if ('trigger' in item) {
      if (item.pattern.test(message)) {
        return item.trigger;
      }
    } else if ('group' in item) {
      const match = message.match(item.pattern);
      if (match && match[item.group]) {
        return match[item.group].trim();
      }
    }
  }
  return null;
}

/**
 * Check if message mentions a chart
 */
function hasChartMention(message: string): boolean {
  return /(?:chart|screenshot|image|attached|see\s+below|👆|👇|📊|📈|📉)/i.test(message);
}

/**
 * Extract risk note from message
 */
function extractRiskNote(message: string): string | null {
  const riskMatch = message.match(/(?:risk|caution|warning|note)[:\s]+([^.!]+)/i);
  if (riskMatch) {
    return riskMatch[1].trim();
  }
  return null;
}

/**
 * Clean and normalize message
 */
function cleanMessage(message: string): string {
  return message
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

/**
 * Calculate confidence score based on what was extracted
 */
function calculateConfidence(entry: Partial<ParsedJournalEntry>): number {
  let score = 0.5; // Base score

  if (entry.ticker) score += 0.2;
  if (entry.setup_type) score += 0.15;
  if (entry.mode) score += 0.1;
  if (entry.trigger) score += 0.05;

  return Math.min(score, 1.0);
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse a journal entry from Discord
 *
 * @param message - Raw message content
 * @returns JournalParseResult with parsed entry or error
 */
export function parseJournalEntry(message: string): JournalParseResult {
  const cleaned = cleanMessage(message);

  if (cleaned.length < 5) {
    return { success: false, error: "Message too short" };
  }

  const ticker = extractTicker(cleaned);
  const action = detectAction(cleaned);
  const mode = detectMode(cleaned);
  const setup_type = extractSetupType(cleaned);
  const trigger = extractTrigger(cleaned);
  const risk_note = extractRiskNote(cleaned);
  const chart_mentioned = hasChartMention(cleaned);

  const entry: ParsedJournalEntry = {
    ticker,
    action,
    setup_type,
    mode,
    reasoning: cleaned,
    trigger: trigger || undefined,
    risk_note: risk_note || undefined,
    chart_mentioned,
    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0,
  };

  entry.confidence = calculateConfidence(entry);

  return { success: true, entry };
}

/**
 * Parse multiple messages, returning all parsed entries
 */
export function parseJournalEntries(messages: string[]): ParsedJournalEntry[] {
  const entries: ParsedJournalEntry[] = [];

  for (const msg of messages) {
    const result = parseJournalEntry(msg);
    if (result.success && result.entry) {
      entries.push(result.entry);
    }
  }

  return entries;
}

/**
 * Link journal entry to a trade by matching ticker and date proximity
 */
export function matchJournalToTrade(
  journalEntry: ParsedJournalEntry,
  trades: { ticker: string; trade_date: string; action: string }[],
  journalDate: Date
): { matched: boolean; trade_index: number } {
  if (!journalEntry.ticker) {
    return { matched: false, trade_index: -1 };
  }

  // Find trades with same ticker within 24 hours
  const journalTime = journalDate.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    if (trade.ticker.toUpperCase() !== journalEntry.ticker.toUpperCase()) {
      continue;
    }

    const tradeTime = new Date(trade.trade_date).getTime();
    if (Math.abs(tradeTime - journalTime) <= oneDayMs) {
      // Check action compatibility
      const journalIsEntry = ["ENTRY", "ADD"].includes(journalEntry.action);
      const tradeIsEntry = ["ENTRY", "ADD"].includes(trade.action);
      const journalIsExit = ["EXIT", "TRIM"].includes(journalEntry.action);
      const tradeIsExit = ["CLOSE", "TRIM", "STOP_OUT"].includes(trade.action);

      if ((journalIsEntry && tradeIsEntry) || (journalIsExit && tradeIsExit)) {
        return { matched: true, trade_index: i };
      }
    }
  }

  return { matched: false, trade_index: -1 };
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Test the parser with sample messages
 */
export function testParser(): void {
  const testCases = [
    // Entry reasoning
    "NBIS long entry 21dma-structure reclaim & backtest",
    "$ALAB long entry - weakness into structure, watching for R2G",
    "Entered NVDA on higher low formation, trigger: break above 145",
    "Long IREN - pullback to 21EMA, structure intact",
    "Added to META position - constructive backtest of 21dma",

    // Exit reasoning
    "Closed IREN - extended beyond 2R, taking profits",
    "Trimmed 1/3 ALAB - hit 2R target",
    "Exited NBIS - broke below structure, cutting loss",

    // Observations
    "Watching NVDA for weakness into structure",
    "AMZN setting up nicely - potential VCP forming",
    "Alert: GOOGL approaching 21EMA support",

    // Mixed formats
    "$TSLA short entry on break below structure",
    "MSFT - reclaim and backtest in progress, watching for strength",
  ];

  console.log("=".repeat(70));
  console.log("Alex Journal Parser Test");
  console.log("=".repeat(70));
  console.log();

  for (const msg of testCases) {
    const result = parseJournalEntry(msg);
    console.log(`Message: "${msg}"`);
    if (result.success && result.entry) {
      const { raw_message, parsed_at, reasoning, ...display } = result.entry;
      console.log(`  ✓ Parsed: ${display.action} ${display.ticker || "(no ticker)"}`);
      console.log(`    Mode: ${display.mode || "N/A"}`);
      console.log(`    Setup: ${display.setup_type || "N/A"}`);
      console.log(`    Confidence: ${(display.confidence * 100).toFixed(0)}%`);
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
  parseJournalEntry,
  parseJournalEntries,
  matchJournalToTrade,
  testParser,
};
