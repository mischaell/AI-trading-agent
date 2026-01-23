/**
 * Report Parser for "The Prime Report" Trading Emails
 *
 * Extracts structured trading data from Prime Report emails:
 * - Market Analysis (QQQE position, structure, action)
 * - Breadth Data (MCSI, MCO readings and signals)
 * - TLMM Signal (trend signal and date)
 * - Market Internals (credit spreads, BTC)
 * - Liquid Leaders (universe tickers, pullback candidates)
 *
 * Uses Claude API for complex/ambiguous section parsing.
 *
 * @see docs/agent_skeleton_v1.0.md for trading rules reference
 */

import Anthropic from "@anthropic-ai/sdk";
import { EmailContent } from "./client";

// =============================================================================
// Types
// =============================================================================

export interface MarketAnalysis {
  qqqe_position: "above" | "below" | "inside";
  qqqe_structure_slope: "rising" | "flat" | "declining";
  market_action: string;
  market_analysis_text: string;
  price_qqqe_text: string;
}

export interface BreadthData {
  mcsi_reading: number;
  mcsi_vs_10dma: "above" | "below";
  mcsi_10dma_slope: "rising" | "flat" | "declining";
  mcsi_slope: "turning_up" | "turning_down" | "flat";
  mco_reading: number;
  mco_zscore: number;
  mco_status: "oversold" | "neutral" | "overbought";
  breadth_text: string;
}

export interface TLMMSignal {
  signal: "PULLBACK" | "UPTREND" | "DOWNTREND" | "NEUTRAL" | "REVERSAL" | string;
  since_date: string;
  market_view_text: string;
}

export interface MarketInternals {
  credit_spreads_signal: string;
  credit_spreads_text: string;
  btc_signal: string;
  btc_text: string;
}

export interface LiquidLeaders {
  universe_tickers: string[];
  universe_count: number;
  pullback_candidates: string[];
  pullback_count: number;
}

export interface ParsedReport {
  report_date: string;
  email_id: string;
  raw_content: string;

  market_analysis: MarketAnalysis;
  breadth_data: BreadthData;
  tlmm_signal: TLMMSignal;
  market_internals: MarketInternals;
  liquid_leaders: LiquidLeaders;

  parsing_confidence: number; // 0-1 confidence score
  parsing_notes: string[];    // Any warnings or notes from parsing
}

// =============================================================================
// Constants
// =============================================================================

// Regex patterns for extracting data
const PATTERNS = {
  // QQQE position
  qqqe_above: /qqqe\s*(is\s*)?(trading\s*)?(above|over)\s*(the\s*)?cloud/i,
  qqqe_below: /qqqe\s*(is\s*)?(trading\s*)?(below|under)\s*(the\s*)?cloud/i,
  qqqe_inside: /qqqe\s*(is\s*)?(trading\s*)?(inside|within|in)\s*(the\s*)?cloud/i,

  // Structure slope
  slope_rising: /(structure|21ema|ma)\s*(is\s*)?(rising|ascending|upward|up)/i,
  slope_declining: /(structure|21ema|ma)\s*(is\s*)?(declining|descending|downward|falling|down)/i,
  slope_flat: /(structure|21ema|ma)\s*(is\s*)?(flat|sideways|neutral)/i,

  // MCSI patterns
  mcsi_value: /mcsi[:\s]+(-?\d+(?:\.\d+)?)/i,
  mcsi_above_10dma: /mcsi\s*(is\s*)?(above|over)\s*(its\s*)?(10\s*-?\s*d?ma|10\s*day)/i,
  mcsi_below_10dma: /mcsi\s*(is\s*)?(below|under)\s*(its\s*)?(10\s*-?\s*d?ma|10\s*day)/i,

  // MCO patterns
  mco_value: /mco[:\s]+(-?\d+(?:\.\d+)?)/i,
  mco_zscore: /(-?\d(?:\.\d)?)\s*[σs]|(-?\d(?:\.\d)?)\s*sigma/i,
  mco_oversold: /(mco|oscillator)\s*(is\s*)?(oversold|extreme\s*low)/i,
  mco_overbought: /(mco|oscillator)\s*(is\s*)?(overbought|extreme\s*high)/i,

  // TLMM Signal
  tlmm_signal: /tlmm[:\s]*(pullback|uptrend|downtrend|neutral|reversal)/i,
  tlmm_since: /since\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\w+\s+\d{1,2})/i,

  // Market action
  action_wait: /wait\s*(and|&)\s*see/i,
  action_test_long: /test\s*long/i,
  action_add_exposure: /add\s*exposure/i,
  action_reduce: /reduce\s*(exposure|risk)/i,
  action_defensive: /defensive|risk\s*off/i,

  // Tickers (3-5 uppercase letters)
  ticker: /\b([A-Z]{2,5})\b/g,

  // Pullback candidates section
  pullback_section: /pullback\s*(candidates?|setups?|opportunities?)[\s:]*([A-Z,\s]+)/i,
};

// Known ticker exclusions (common words that match ticker pattern)
const TICKER_EXCLUSIONS = new Set([
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER",
  "WAS", "ONE", "OUR", "OUT", "DAY", "HAD", "HAS", "HIS", "HOW", "ITS",
  "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "BOY", "DID", "GET",
  "LET", "PUT", "SAY", "SHE", "TOO", "USE", "QQQE", "MCO", "MCSI", "TLMM",
  "DMA", "EMA", "ATR", "SSL", "HIGH", "LOW", "OPEN", "CLOSE", "BTC", "ETH",
  "SPY", "QQQ", "IWM", "DIA", "VIX", "USD", "EUR", "GBP", "JPY", "CAD",
]);

// Known valid tickers in Nasdaq-100 (for validation)
const NASDAQ_100_TICKERS = new Set([
  "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
  "AMZN", "ANSS", "ARM", "ASML", "AVGO", "AZN", "BIIB", "BKNG", "BKR", "CCEP",
  "CDNS", "CDW", "CEG", "CHTR", "CIEN", "CMCSA", "COHR", "COST", "CPRT", "CRDO",
  "CRWD", "CSCO", "CSGP", "CSX", "CTAS", "CTSH", "CVNA", "DDOG", "DLTR", "DXCM",
  "EA", "EXC", "FANG", "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL",
  "HON", "IDXX", "ILMN", "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN",
  "LRCX", "LULU", "MAR", "MCHP", "MDB", "MDLZ", "MELI", "META", "MNST", "MRNA",
  "MRVL", "MSFT", "MU", "NFLX", "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW",
  "PAYX", "PCAR", "PDD", "PEP", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX",
  "SMCI", "SNPS", "TEAM", "TMUS", "TSLA", "TTD", "TTWO", "TXN", "VRSK", "VRTX",
  "VRT", "WBD", "WDAY", "XEL", "ZS",
]);

// =============================================================================
// Regex-based Extraction Functions
// =============================================================================

/**
 * Extract QQQE position from text
 */
function extractQqqePosition(text: string): "above" | "below" | "inside" | null {
  if (PATTERNS.qqqe_above.test(text)) return "above";
  if (PATTERNS.qqqe_below.test(text)) return "below";
  if (PATTERNS.qqqe_inside.test(text)) return "inside";
  return null;
}

/**
 * Extract structure slope from text
 */
function extractStructureSlope(text: string): "rising" | "flat" | "declining" | null {
  if (PATTERNS.slope_rising.test(text)) return "rising";
  if (PATTERNS.slope_declining.test(text)) return "declining";
  if (PATTERNS.slope_flat.test(text)) return "flat";
  return null;
}

/**
 * Extract market action recommendation
 */
function extractMarketAction(text: string): string {
  if (PATTERNS.action_wait.test(text)) return "wait & see";
  if (PATTERNS.action_test_long.test(text)) return "test long";
  if (PATTERNS.action_add_exposure.test(text)) return "add exposure";
  if (PATTERNS.action_reduce.test(text)) return "reduce exposure";
  if (PATTERNS.action_defensive.test(text)) return "defensive";
  return "unknown";
}

/**
 * Extract MCSI reading
 */
function extractMcsiReading(text: string): number | null {
  const match = text.match(PATTERNS.mcsi_value);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Extract MCSI vs 10DMA position
 */
function extractMcsiVs10dma(text: string): "above" | "below" | null {
  if (PATTERNS.mcsi_above_10dma.test(text)) return "above";
  if (PATTERNS.mcsi_below_10dma.test(text)) return "below";
  return null;
}

/**
 * Extract MCO reading
 */
function extractMcoReading(text: string): number | null {
  const match = text.match(PATTERNS.mco_value);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Extract MCO z-score
 */
function extractMcoZscore(text: string): number | null {
  const match = text.match(PATTERNS.mco_zscore);
  if (match) {
    // Match is in group 1 or 2
    const value = match[1] || match[2];
    return parseFloat(value);
  }
  return null;
}

/**
 * Extract MCO status
 */
function extractMcoStatus(text: string): "oversold" | "neutral" | "overbought" {
  if (PATTERNS.mco_oversold.test(text)) return "oversold";
  if (PATTERNS.mco_overbought.test(text)) return "overbought";
  return "neutral";
}

/**
 * Extract TLMM signal
 */
function extractTlmmSignal(text: string): string | null {
  const match = text.match(PATTERNS.tlmm_signal);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Extract TLMM since date
 */
function extractTlmmSinceDate(text: string): string | null {
  const match = text.match(PATTERNS.tlmm_since);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Extract tickers from text (all valid tickers, not just Nasdaq-100)
 */
function extractTickers(text: string): string[] {
  const matches = text.match(PATTERNS.ticker) || [];
  const tickers = new Set<string>();

  for (const match of matches) {
    const ticker = match.toUpperCase();
    // Only exclude common words, capture all other valid tickers
    if (!TICKER_EXCLUSIONS.has(ticker)) {
      tickers.add(ticker);
    }
  }

  return Array.from(tickers);
}

/**
 * Extract tickers from a specific section (e.g., Liquid Leaders, Universe)
 * Looks for section headers and extracts all tickers after them
 */
function extractTickersFromSection(text: string, sectionPattern: RegExp): string[] {
  const match = text.match(sectionPattern);
  if (!match) return [];

  // Get text after the section header (next 2000 chars or until next section)
  const startIndex = match.index! + match[0].length;
  const sectionText = text.substring(startIndex, startIndex + 2000);

  // Extract tickers from this section
  const tickerMatches = sectionText.match(PATTERNS.ticker) || [];
  const tickers = new Set<string>();

  for (const t of tickerMatches) {
    const ticker = t.toUpperCase();
    if (!TICKER_EXCLUSIONS.has(ticker)) {
      tickers.add(ticker);
    }
  }

  return Array.from(tickers);
}

/**
 * Extract the Liquid Leaders / Universe tickers
 * Looks for specific section headers in the email
 */
function extractUniverseTickers(text: string): string[] {
  // Try different section patterns - order by specificity
  const patterns = [
    { name: "ranked by RS", pattern: /ranked\s*by\s*(?:1-day\s*)?rs[:\s]*/i },
    { name: "liquid leaders", pattern: /liquid\s*leaders?\s*(?:universe|list)?[:\s]*/i },
    { name: "universe", pattern: /universe\s*(?:list)?[:\s]*/i },
    { name: "top RS leaders", pattern: /top\s*(?:\d+\s*)?(?:rs\s*)?leaders?[:\s]*/i },
    { name: "RS leaders", pattern: /(?:relative\s*strength|rs)\s*leaders?[:\s]*/i },
    { name: "stock tickers", pattern: /stock\s*tickers?[:\s]*/i },
  ];

  for (const { name, pattern } of patterns) {
    const tickers = extractTickersFromSection(text, pattern);
    if (tickers.length >= 5) {
      console.log(`[Parser] Found ${tickers.length} universe tickers using "${name}" pattern`);
      return tickers;
    }
  }

  // Fallback: extract all tickers from the document
  const allTickers = extractTickers(text);
  console.log(`[Parser] Fallback: extracted ${allTickers.length} tickers from full text`);
  return allTickers;
}

/**
 * Extract pullback candidates from text
 */
function extractPullbackCandidates(text: string): string[] {
  const match = text.match(PATTERNS.pullback_section);
  if (match) {
    const candidatesText = match[2];
    return extractTickers(candidatesText);
  }

  // Fallback: look for explicit list after "pullback" mention
  const pullbackIndex = text.toLowerCase().indexOf("pullback");
  if (pullbackIndex !== -1) {
    const afterPullback = text.substring(pullbackIndex, pullbackIndex + 200);
    return extractTickers(afterPullback);
  }

  return [];
}

// =============================================================================
// Section Text Extraction Functions
// =============================================================================

/**
 * Section header patterns for parsing Prime Report emails
 */
const SECTION_HEADERS = {
  market_analysis: /MARKET\s*ANALYSIS/i,
  price_qqqe: /PRICE\s+QQQE\s*[\d.]+%?[↑↓]?/i,
  breadth: /BREADTH\s*\(MCSI\/MCO\)/i,
  market_view: /360°?\s*MARKET\s*VIEW/i,
  market_internals: /MARKET\s*INTERNALS/i,
  credit_spreads: /Credit\s*Spreads\s*\(SHY\/HYG\)/i,
  btc: /#?BTC\s*\(Bitcoin\)/i,
  liquid_leaders_rs: /Liquid\s*Leaders\s*(?:sorted\s*)?by\s*1-Day\s*(?:Return|RS)/i,
  pullback_scan: /Liquid\s*Leaders\s*DAILY-structure\s*Pullback\s*scan/i,
};

/**
 * Patterns that indicate promotional/footer content - should end any section
 */
const PROMO_END_PATTERNS = [
  /Try\s+Traders?\s*lab/i,
  /Leader\s*Stalk\s*list/i,
  /Newsletter/i,
  /Unsubscribe/i,
  /Click\s+here\s+to/i,
  /©\s*\d{4}/i,
  /All\s+rights\s+reserved/i,
  /View\s+in\s+browser/i,
  /Forward\s+this\s+email/i,
];

/**
 * Extract text content between two section headers
 * @param text - Full email text
 * @param startPattern - Regex pattern for section start
 * @param endPatterns - Array of regex patterns that mark the end of this section
 * @returns Extracted text content (trimmed)
 */
function extractSectionText(
  text: string,
  startPattern: RegExp,
  endPatterns: RegExp[]
): string {
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) {
    return "";
  }

  // Start after the header
  const startIndex = startMatch.index + startMatch[0].length;
  let endIndex = text.length;

  // Combine section end patterns with promotional end patterns
  const allEndPatterns = [...endPatterns, ...PROMO_END_PATTERNS];

  // Find the earliest next section or promotional content
  for (const endPattern of allEndPatterns) {
    const endMatch = text.substring(startIndex).match(endPattern);
    if (endMatch && endMatch.index !== undefined) {
      const potentialEnd = startIndex + endMatch.index;
      if (potentialEnd < endIndex) {
        endIndex = potentialEnd;
      }
    }
  }

  // Extract and clean the text
  const sectionText = text.substring(startIndex, endIndex);
  return sectionText
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000); // Limit to 2000 chars
}

/**
 * Extract MARKET ANALYSIS section text
 */
function extractMarketAnalysisText(text: string): string {
  return extractSectionText(text, SECTION_HEADERS.market_analysis, [
    SECTION_HEADERS.price_qqqe,
    SECTION_HEADERS.breadth,
    SECTION_HEADERS.market_view,
  ]);
}

/**
 * Extract PRICE QQQE section text
 */
function extractPriceQqqeText(text: string): string {
  return extractSectionText(text, SECTION_HEADERS.price_qqqe, [
    SECTION_HEADERS.breadth,
    SECTION_HEADERS.market_view,
    SECTION_HEADERS.market_internals,
  ]);
}

/**
 * Extract BREADTH (MCSI/MCO) section text
 */
function extractBreadthText(text: string): string {
  return extractSectionText(text, SECTION_HEADERS.breadth, [
    SECTION_HEADERS.market_view,
    SECTION_HEADERS.market_internals,
    SECTION_HEADERS.credit_spreads,
  ]);
}

/**
 * Extract 360° MARKET VIEW section text
 */
function extractMarketViewText(text: string): string {
  return extractSectionText(text, SECTION_HEADERS.market_view, [
    SECTION_HEADERS.market_internals,
    SECTION_HEADERS.credit_spreads,
    SECTION_HEADERS.btc,
  ]);
}

/**
 * Extract Credit Spreads section text
 */
function extractCreditSpreadsText(text: string): string {
  return extractSectionText(text, SECTION_HEADERS.credit_spreads, [
    SECTION_HEADERS.btc,
    SECTION_HEADERS.liquid_leaders_rs,
    SECTION_HEADERS.pullback_scan,
  ]);
}

/**
 * Extract BTC section text
 */
function extractBtcText(text: string): string {
  return extractSectionText(text, SECTION_HEADERS.btc, [
    SECTION_HEADERS.liquid_leaders_rs,
    SECTION_HEADERS.pullback_scan,
  ]);
}

/**
 * Extract Liquid Leaders tickers from the "sorted by 1-Day Return" section
 */
function extractLiquidLeadersTickers(text: string): string[] {
  const sectionText = extractSectionText(
    text,
    SECTION_HEADERS.liquid_leaders_rs,
    [SECTION_HEADERS.pullback_scan]
  );

  if (!sectionText) {
    console.log("[Parser] Liquid Leaders section not found, trying fallback patterns");
    return extractUniverseTickers(text);
  }

  // Extract tickers from comma-separated list
  const tickers = extractTickers(sectionText);
  console.log(`[Parser] Extracted ${tickers.length} Liquid Leaders tickers from section`);
  return tickers;
}

/**
 * Extract Pullback scan tickers
 */
function extractPullbackScanTickers(text: string): string[] {
  const sectionText = extractSectionText(
    text,
    SECTION_HEADERS.pullback_scan,
    [/^$/] // End at document end or next major section
  );

  if (!sectionText) {
    console.log("[Parser] Pullback scan section not found, trying fallback");
    return extractPullbackCandidates(text);
  }

  const tickers = extractTickers(sectionText);
  console.log(`[Parser] Extracted ${tickers.length} pullback tickers from section`);
  return tickers;
}

// =============================================================================
// Claude API Extraction (for complex/ambiguous content)
// =============================================================================

/**
 * Use Claude to extract structured data from email content
 */
async function extractWithClaude(
  emailText: string,
  emailHtml: string
): Promise<Partial<ParsedReport>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `You are analyzing a trading report email called "The Prime Report". Extract the following structured data from the email content.

EMAIL CONTENT:
---
${emailText || stripHtml(emailHtml)}
---

Extract and return ONLY a JSON object with these fields (use null for missing values):

{
  "market_analysis": {
    "qqqe_position": "above" | "below" | "inside",
    "qqqe_structure_slope": "rising" | "flat" | "declining",
    "market_action": "string describing recommended action"
  },
  "breadth_data": {
    "mcsi_reading": number,
    "mcsi_vs_10dma": "above" | "below",
    "mcsi_10dma_slope": "rising" | "flat" | "declining",
    "mcsi_slope": "turning_up" | "turning_down" | "flat",
    "mco_reading": number,
    "mco_zscore": number (e.g., -2 for -2σ),
    "mco_status": "oversold" | "neutral" | "overbought"
  },
  "tlmm_signal": {
    "signal": "PULLBACK" | "UPTREND" | "DOWNTREND" | "NEUTRAL" | "REVERSAL",
    "since_date": "date string when signal started"
  },
  "market_internals": {
    "credit_spreads_signal": "string",
    "btc_signal": "string"
  },
  "liquid_leaders": {
    "universe_tickers": ["array", "of", "ticker", "symbols"],
    "pullback_candidates": ["specific", "pullback", "tickers"]
  }
}

Only include valid Nasdaq-100 tickers. Return ONLY the JSON, no explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract JSON from response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      market_analysis: parsed.market_analysis,
      breadth_data: parsed.breadth_data,
      tlmm_signal: parsed.tlmm_signal,
      market_internals: parsed.market_internals,
      liquid_leaders: {
        universe_tickers: parsed.liquid_leaders?.universe_tickers || [],
        universe_count: parsed.liquid_leaders?.universe_tickers?.length || 0,
        pullback_candidates: parsed.liquid_leaders?.pullback_candidates || [],
        pullback_count: parsed.liquid_leaders?.pullback_candidates?.length || 0,
      },
    };
  } catch (error) {
    console.error("Claude extraction failed:", error);
    throw error;
  }
}

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip promotional/footer content from email text
 * Removes content starting from promotional markers
 */
function stripPromotionalContent(text: string): string {
  let cleaned = text;

  // Find the earliest promotional content and truncate there
  const promoMarkers = [
    /Try\s+Traders?\s*lab/i,
    /Leader\s*Stalk\s*list/i,
    /Unsubscribe/i,
    /©\s*\d{4}/i,
    /All\s+rights\s+reserved/i,
    /View\s+in\s+browser/i,
  ];

  let earliestPromoIndex = cleaned.length;
  for (const marker of promoMarkers) {
    const match = cleaned.search(marker);
    if (match !== -1 && match < earliestPromoIndex) {
      earliestPromoIndex = match;
    }
  }

  if (earliestPromoIndex < cleaned.length) {
    cleaned = cleaned.substring(0, earliestPromoIndex);
  }

  return cleaned.trim();
}

// =============================================================================
// Main Parser Function
// =============================================================================

/**
 * Parse a Prime Report email and extract structured data
 *
 * Uses regex patterns first, then falls back to Claude API for missing/ambiguous data.
 *
 * @param email - Email content from Gmail API
 * @param reportDate - Date of the report
 * @returns Parsed report with structured data
 */
export async function parseReport(
  email: EmailContent,
  reportDate: string
): Promise<ParsedReport> {
  const rawText = email.textBody || stripHtml(email.htmlBody);
  // Strip promotional/footer content before parsing
  const text = stripPromotionalContent(rawText);
  const notes: string[] = [];
  let confidence = 1.0;

  // Debug: log a snippet of the content to help understand the format
  console.log(`[Parser] Parsing report for ${reportDate}, text length: ${text.length} (stripped from ${rawText.length})`);
  console.log(`[Parser] First 500 chars: ${text.substring(0, 500).replace(/\n/g, ' ')}`);

  // Extract section text first
  const sectionTexts = {
    market_analysis_text: extractMarketAnalysisText(text),
    price_qqqe_text: extractPriceQqqeText(text),
    breadth_text: extractBreadthText(text),
    market_view_text: extractMarketViewText(text),
    credit_spreads_text: extractCreditSpreadsText(text),
    btc_text: extractBtcText(text),
  };

  // Debug: log section extractions
  console.log(`[Parser] Section texts extracted:`);
  console.log(`  - Market Analysis: ${sectionTexts.market_analysis_text.substring(0, 100)}...`);
  console.log(`  - Price QQQE: ${sectionTexts.price_qqqe_text.substring(0, 100)}...`);
  console.log(`  - Breadth: ${sectionTexts.breadth_text.substring(0, 100)}...`);
  console.log(`  - Market View: ${sectionTexts.market_view_text.substring(0, 100)}...`);

  // Try regex extraction first
  const regexResult = {
    qqqe_position: extractQqqePosition(text),
    qqqe_structure_slope: extractStructureSlope(text),
    market_action: extractMarketAction(text),
    mcsi_reading: extractMcsiReading(text),
    mcsi_vs_10dma: extractMcsiVs10dma(text),
    mco_reading: extractMcoReading(text),
    mco_zscore: extractMcoZscore(text),
    mco_status: extractMcoStatus(text),
    tlmm_signal: extractTlmmSignal(text),
    tlmm_since_date: extractTlmmSinceDate(text),
    universe_tickers: extractLiquidLeadersTickers(text),
    pullback_candidates: extractPullbackScanTickers(text),
  };

  // Debug: log extraction results
  console.log(`[Parser] Extracted universe tickers: ${regexResult.universe_tickers.length} - ${regexResult.universe_tickers.slice(0, 10).join(', ')}${regexResult.universe_tickers.length > 10 ? '...' : ''}`);
  console.log(`[Parser] Extracted pullback candidates: ${regexResult.pullback_candidates.join(', ')}`);

  // Check what's missing
  const missingFields: string[] = [];
  if (!regexResult.qqqe_position) missingFields.push("qqqe_position");
  if (!regexResult.qqqe_structure_slope) missingFields.push("qqqe_structure_slope");
  if (!regexResult.mcsi_reading) missingFields.push("mcsi_reading");
  if (!regexResult.mco_reading) missingFields.push("mco_reading");
  if (regexResult.universe_tickers.length === 0) missingFields.push("universe_tickers");

  // If too many fields missing, use Claude API
  let claudeResult: Partial<ParsedReport> | null = null;
  if (missingFields.length > 2) {
    notes.push(`Regex extraction incomplete (missing: ${missingFields.join(", ")}), using Claude API`);
    confidence -= 0.1;

    try {
      claudeResult = await extractWithClaude(email.textBody, email.htmlBody);
      notes.push("Claude API extraction successful");
    } catch (error) {
      notes.push(`Claude API extraction failed: ${error}`);
      confidence -= 0.3;
    }
  }

  // Merge results (prefer regex for exact matches, Claude for missing)
  const marketAnalysis: MarketAnalysis = {
    qqqe_position:
      regexResult.qqqe_position ||
      claudeResult?.market_analysis?.qqqe_position ||
      "inside",
    qqqe_structure_slope:
      regexResult.qqqe_structure_slope ||
      claudeResult?.market_analysis?.qqqe_structure_slope ||
      "flat",
    market_action:
      regexResult.market_action !== "unknown"
        ? regexResult.market_action
        : claudeResult?.market_analysis?.market_action || "unknown",
    market_analysis_text: sectionTexts.market_analysis_text,
    price_qqqe_text: sectionTexts.price_qqqe_text,
  };

  const breadthData: BreadthData = {
    mcsi_reading:
      regexResult.mcsi_reading ??
      claudeResult?.breadth_data?.mcsi_reading ??
      0,
    mcsi_vs_10dma:
      regexResult.mcsi_vs_10dma ||
      claudeResult?.breadth_data?.mcsi_vs_10dma ||
      "below",
    mcsi_10dma_slope:
      claudeResult?.breadth_data?.mcsi_10dma_slope || "flat",
    mcsi_slope:
      claudeResult?.breadth_data?.mcsi_slope || "flat",
    mco_reading:
      regexResult.mco_reading ??
      claudeResult?.breadth_data?.mco_reading ??
      0,
    mco_zscore:
      regexResult.mco_zscore ??
      claudeResult?.breadth_data?.mco_zscore ??
      0,
    mco_status:
      regexResult.mco_status ||
      claudeResult?.breadth_data?.mco_status ||
      "neutral",
    breadth_text: sectionTexts.breadth_text,
  };

  const tlmmSignal: TLMMSignal = {
    signal:
      regexResult.tlmm_signal ||
      claudeResult?.tlmm_signal?.signal ||
      "NEUTRAL",
    since_date:
      regexResult.tlmm_since_date ||
      claudeResult?.tlmm_signal?.since_date ||
      reportDate,
    market_view_text: sectionTexts.market_view_text,
  };

  const marketInternals: MarketInternals = {
    credit_spreads_signal:
      claudeResult?.market_internals?.credit_spreads_signal || "unknown",
    credit_spreads_text: sectionTexts.credit_spreads_text,
    btc_signal:
      claudeResult?.market_internals?.btc_signal || "unknown",
    btc_text: sectionTexts.btc_text,
  };

  const universeTickers =
    regexResult.universe_tickers.length > 0
      ? regexResult.universe_tickers
      : claudeResult?.liquid_leaders?.universe_tickers || [];

  const pullbackCandidates =
    regexResult.pullback_candidates.length > 0
      ? regexResult.pullback_candidates
      : claudeResult?.liquid_leaders?.pullback_candidates || [];

  const liquidLeaders: LiquidLeaders = {
    universe_tickers: universeTickers,
    universe_count: universeTickers.length,
    pullback_candidates: pullbackCandidates,
    pullback_count: pullbackCandidates.length,
  };

  // Validate and adjust confidence
  if (liquidLeaders.universe_count < 20) {
    notes.push(`Low universe count (${liquidLeaders.universe_count}), expected 30-40`);
    confidence -= 0.1;
  }

  if (breadthData.mcsi_reading === 0 && breadthData.mco_reading === 0) {
    notes.push("Both MCSI and MCO readings are 0, data may be incomplete");
    confidence -= 0.2;
  }

  return {
    report_date: reportDate,
    email_id: email.id,
    raw_content: text.substring(0, 10000), // Limit raw content size

    market_analysis: marketAnalysis,
    breadth_data: breadthData,
    tlmm_signal: tlmmSignal,
    market_internals: marketInternals,
    liquid_leaders: liquidLeaders,

    parsing_confidence: Math.max(0, Math.min(1, confidence)),
    parsing_notes: notes,
  };
}

/**
 * Parse multiple reports in batch
 *
 * @param emails - Array of email contents
 * @param reportDates - Corresponding dates for each email
 * @returns Array of parsed reports
 */
export async function parseReportsBatch(
  emails: EmailContent[],
  reportDates: string[]
): Promise<ParsedReport[]> {
  const results: ParsedReport[] = [];

  for (let i = 0; i < emails.length; i++) {
    try {
      const report = await parseReport(emails[i], reportDates[i]);
      results.push(report);
    } catch (error) {
      console.error(`Failed to parse report for ${reportDates[i]}:`, error);
    }
  }

  return results;
}

/**
 * Validate a parsed report for completeness
 */
export function validateReport(report: ParsedReport): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!report.report_date) errors.push("Missing report_date");
  if (!report.market_analysis.qqqe_position) errors.push("Missing qqqe_position");
  if (report.breadth_data.mcsi_reading === null) errors.push("Missing mcsi_reading");
  if (report.breadth_data.mco_reading === null) errors.push("Missing mco_reading");
  if (report.liquid_leaders.universe_count === 0) errors.push("Empty universe_tickers");

  // Range validations
  if (report.breadth_data.mcsi_reading < -2000 || report.breadth_data.mcsi_reading > 2000) {
    errors.push(`MCSI reading out of range: ${report.breadth_data.mcsi_reading}`);
  }
  if (report.breadth_data.mco_reading < -500 || report.breadth_data.mco_reading > 500) {
    errors.push(`MCO reading out of range: ${report.breadth_data.mco_reading}`);
  }

  // Confidence check
  if (report.parsing_confidence < 0.5) {
    errors.push(`Low parsing confidence: ${report.parsing_confidence}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  parseReport,
  parseReportsBatch,
  validateReport,

  // Individual extractors (for testing)
  extractQqqePosition,
  extractStructureSlope,
  extractMarketAction,
  extractMcsiReading,
  extractMcoReading,
  extractTickers,
  extractUniverseTickers,
  extractPullbackCandidates,
};
