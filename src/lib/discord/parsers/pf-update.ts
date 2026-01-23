/**
 * Discord #pf-update Channel Parser
 *
 * Parses portfolio commentary and updates from Discord.
 *
 * Extracts:
 * - Overall sentiment (bullish, bearish, neutral, cautious)
 * - Mentioned tickers
 * - Key points and decisions
 * - Lessons learned
 * - Performance mentions
 *
 * Uses pattern matching for structured extraction and
 * can integrate with Claude API for advanced summarization.
 *
 * @module discord/parsers/pf-update
 */

// =============================================================================
// Types
// =============================================================================

export type Sentiment = "bullish" | "bearish" | "neutral" | "cautious" | "mixed";

export interface ParsedPortfolioUpdate {
  update_date: string;
  commentary: string;
  sentiment: Sentiment;
  sentiment_score: number; // -1 to 1 scale

  // Extracted content
  tickers_mentioned: string[];
  key_points: string[];
  performance_mentions: PerformanceMention[];
  lessons: string[];
  decisions: string[];

  // Market context
  market_state_mentioned: string | null;
  exposure_mentioned: number | null; // Portfolio exposure %

  // Metadata
  raw_message: string;
  parsed_at: string;
  confidence: number;
  word_count: number;
}

export interface PerformanceMention {
  type: "pnl" | "return" | "win_rate" | "r_multiple" | "exposure";
  value: string;
  context: string;
}

export interface PortfolioParseResult {
  success: boolean;
  update?: ParsedPortfolioUpdate;
  error?: string;
}

// =============================================================================
// Sentiment Analysis Patterns
// =============================================================================

const BULLISH_PATTERNS = [
  /\b(?:bullish|optimistic|positive|constructive|strong|healthy)\b/i,
  /\b(?:uptrend|rally|breakout|momentum)\b/i,
  /\b(?:adding|added|increasing|accumulating)\s+(?:exposure|positions?)/i,
  /\b(?:looking\s+for\s+entries|ready\s+to\s+buy|buying\s+dips?)\b/i,
  /\b(?:market\s+is\s+working|setup\s+is\s+good|conditions\s+are\s+favorable)\b/i,
  /\b(?:new\s+highs?|all[- ]time\s+high|ath)\b/i,
  /\b(?:leaders?\s+(?:are\s+)?acting\s+well)\b/i,
  /\b(?:breadth\s+(?:is\s+)?improving|mcsi\s+turning\s+up)\b/i,
];

const BEARISH_PATTERNS = [
  /\b(?:bearish|pessimistic|negative|weak|concerning)\b/i,
  /\b(?:downtrend|selloff|breakdown|correction)\b/i,
  /\b(?:reducing|reduced|cutting|trimming)\s+(?:exposure|positions?)/i,
  /\b(?:raising\s+cash|going\s+to\s+cash|defensive)\b/i,
  /\b(?:market\s+is\s+(?:not\s+)?working|setup\s+is\s+poor|conditions\s+are\s+tough)\b/i,
  /\b(?:new\s+lows?|breaking\s+down|failed\s+breakout)\b/i,
  /\b(?:leaders?\s+(?:are\s+)?failing|distribution)\b/i,
  /\b(?:breadth\s+(?:is\s+)?deteriorating|mcsi\s+turning\s+down)\b/i,
];

const CAUTIOUS_PATTERNS = [
  /\b(?:cautious|careful|selective|patient|waiting)\b/i,
  /\b(?:watching|monitoring|observing|on\s+the\s+sidelines?)\b/i,
  /\b(?:mixed\s+signals?|conflicting|uncertain)\b/i,
  /\b(?:small(?:er)?\s+positions?|reduced\s+size|risk[- ]off)\b/i,
  /\b(?:not\s+(?:many|much)\s+(?:setups?|opportunities))\b/i,
  /\b(?:wait(?:ing)?\s+for\s+confirmation|need\s+to\s+see)\b/i,
  /\b(?:choppy|range[- ]bound|consolidat(?:ing|ion))\b/i,
];

const NEUTRAL_PATTERNS = [
  /\b(?:neutral|flat|unchanged|status\s+quo)\b/i,
  /\b(?:no\s+changes?|holding\s+steady|same\s+positions?)\b/i,
  /\b(?:balanced|even)\b/i,
];

// =============================================================================
// Content Extraction Patterns
// =============================================================================

/**
 * Ticker extraction - matches $TICKER and standalone ticker-like words
 */
const TICKER_PATTERN = /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\b(?=\s+(?:is|was|looks?|acting|position|trade|entry|exit|long|short))/gi;

/**
 * Performance mention patterns
 */
const PERFORMANCE_PATTERNS = [
  { pattern: /(?:up|down|gained|lost)\s+([+-]?\d+(?:\.\d+)?)\s*%/i, type: "return" as const },
  { pattern: /(?:pnl|p&l|profit|loss)[:\s]+([+-]?\$?\d+(?:,\d{3})*(?:\.\d+)?)/i, type: "pnl" as const },
  { pattern: /win\s*rate[:\s]+(\d+(?:\.\d+)?)\s*%/i, type: "win_rate" as const },
  { pattern: /([+-]?\d+(?:\.\d+)?)\s*R\b/i, type: "r_multiple" as const },
  { pattern: /(?:exposure|invested)[:\s]+(\d+(?:\.\d+)?)\s*%/i, type: "exposure" as const },
  { pattern: /(\d+)\s*(?:out\s+of|\/)\s*(\d+)\s+(?:winners?|trades?\s+won)/i, type: "win_rate" as const },
];

/**
 * Market state patterns
 */
const MARKET_STATE_PATTERNS = [
  { pattern: /confirmed\s+uptrend/i, state: "CONFIRMED_UPTREND" },
  { pattern: /rally\s+attempt/i, state: "RALLY_ATTEMPT" },
  { pattern: /uptrend\s+under\s+pressure/i, state: "UPTREND_UNDER_PRESSURE" },
  { pattern: /pullback/i, state: "PULLBACK" },
  { pattern: /correction/i, state: "CORRECTION" },
  { pattern: /downtrend/i, state: "DOWNTREND" },
];

/**
 * Lesson patterns
 */
const LESSON_PATTERNS = [
  /lesson[:\s]+([^.!?]+[.!?])/gi,
  /learned[:\s]+([^.!?]+[.!?])/gi,
  /takeaway[:\s]+([^.!?]+[.!?])/gi,
  /note\s+to\s+self[:\s]+([^.!?]+[.!?])/gi,
  /(?:should(?:'ve|n't)\s+have|next\s+time)[:\s]*([^.!?]+[.!?])/gi,
  /mistake[:\s]+([^.!?]+[.!?])/gi,
];

/**
 * Decision patterns
 */
const DECISION_PATTERNS = [
  /(?:decided|going)\s+to\s+([^.!?]+[.!?])/gi,
  /will\s+(?:be\s+)?([^.!?]+[.!?])/gi,
  /plan(?:ning)?\s+to\s+([^.!?]+[.!?])/gi,
  /action[:\s]+([^.!?]+[.!?])/gi,
];

/**
 * Key point detection - sentences with important indicators
 */
const KEY_POINT_INDICATORS = [
  /^important/i,
  /^key/i,
  /^note/i,
  /^reminder/i,
  /^focus/i,
  /^priority/i,
  /^\d+\)/,      // Numbered points like "1)"
  /^[-•*]/,      // Bullet points
  /^→/,          // Arrow points
];

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Extract all tickers mentioned in the message
 */
function extractTickers(message: string): string[] {
  const tickers = new Set<string>();

  // Extract $TICKER format
  const dollarMatches = message.matchAll(/\$([A-Z]{1,5})\b/g);
  for (const match of Array.from(dollarMatches)) {
    tickers.add(match[1]);
  }

  // Extract contextual tickers
  const contextMatches = message.matchAll(/\b([A-Z]{2,5})\b(?=\s+(?:is|was|looks?|acting|position|trade|long|short))/g);
  for (const match of Array.from(contextMatches)) {
    // Filter out common words that look like tickers
    const word = match[1];
    if (!["IS", "WAS", "THE", "AND", "FOR", "NOT", "BUT", "ALL", "ARE", "HAS"].includes(word)) {
      tickers.add(word);
    }
  }

  return Array.from(tickers).sort();
}

/**
 * Analyze sentiment from message content
 */
function analyzeSentiment(message: string): { sentiment: Sentiment; score: number } {
  let bullishScore = 0;
  let bearishScore = 0;
  let cautiousScore = 0;
  let neutralScore = 0;

  // Count pattern matches
  for (const pattern of BULLISH_PATTERNS) {
    if (pattern.test(message)) bullishScore++;
  }
  for (const pattern of BEARISH_PATTERNS) {
    if (pattern.test(message)) bearishScore++;
  }
  for (const pattern of CAUTIOUS_PATTERNS) {
    if (pattern.test(message)) cautiousScore++;
  }
  for (const pattern of NEUTRAL_PATTERNS) {
    if (pattern.test(message)) neutralScore++;
  }

  const total = bullishScore + bearishScore + cautiousScore + neutralScore;

  if (total === 0) {
    return { sentiment: "neutral", score: 0 };
  }

  // Determine primary sentiment
  const max = Math.max(bullishScore, bearishScore, cautiousScore, neutralScore);

  // Check for mixed signals
  if (bullishScore > 0 && bearishScore > 0 && Math.abs(bullishScore - bearishScore) <= 1) {
    return { sentiment: "mixed", score: 0 };
  }

  if (max === bullishScore) {
    const score = (bullishScore - bearishScore) / total;
    return { sentiment: "bullish", score: Math.min(score, 1) };
  }
  if (max === bearishScore) {
    const score = (bearishScore - bullishScore) / total;
    return { sentiment: "bearish", score: -Math.min(score, 1) };
  }
  if (max === cautiousScore) {
    return { sentiment: "cautious", score: -0.3 };
  }

  return { sentiment: "neutral", score: 0 };
}

/**
 * Extract performance mentions from message
 */
function extractPerformanceMentions(message: string): PerformanceMention[] {
  const mentions: PerformanceMention[] = [];

  for (const { pattern, type } of PERFORMANCE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      // Get surrounding context (up to 50 chars each side)
      const index = message.indexOf(match[0]);
      const start = Math.max(0, index - 50);
      const end = Math.min(message.length, index + match[0].length + 50);
      const context = message.slice(start, end).trim();

      mentions.push({
        type,
        value: match[1],
        context,
      });
    }
  }

  return mentions;
}

/**
 * Extract market state mentioned
 */
function extractMarketState(message: string): string | null {
  for (const { pattern, state } of MARKET_STATE_PATTERNS) {
    if (pattern.test(message)) {
      return state;
    }
  }
  return null;
}

/**
 * Extract exposure percentage if mentioned
 */
function extractExposure(message: string): number | null {
  const match = message.match(/(?:exposure|invested|deployed)[:\s]+(\d+(?:\.\d+)?)\s*%/i);
  if (match) {
    return parseFloat(match[1]);
  }

  // Alternative format: "at 65% exposure"
  const altMatch = message.match(/at\s+(\d+(?:\.\d+)?)\s*%\s+(?:exposure|invested)/i);
  if (altMatch) {
    return parseFloat(altMatch[1]);
  }

  return null;
}

/**
 * Extract lessons from message
 */
function extractLessons(message: string): string[] {
  const lessons: string[] = [];

  for (const pattern of LESSON_PATTERNS) {
    const matches = message.matchAll(pattern);
    for (const match of Array.from(matches)) {
      if (match[1]) {
        lessons.push(match[1].trim());
      }
    }
  }

  return lessons;
}

/**
 * Extract decisions from message
 */
function extractDecisions(message: string): string[] {
  const decisions: string[] = [];

  for (const pattern of DECISION_PATTERNS) {
    const matches = message.matchAll(pattern);
    for (const match of Array.from(matches)) {
      if (match[1]) {
        const decision = match[1].trim();
        // Filter out very short or common phrases
        if (decision.length > 10 && !decision.toLowerCase().startsWith("be ")) {
          decisions.push(decision);
        }
      }
    }
  }

  return decisions;
}

/**
 * Extract key points from message
 */
function extractKeyPoints(message: string): string[] {
  const points: string[] = [];

  // Split by newlines and check each line
  const lines = message.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    // Check if line starts with a key point indicator
    for (const pattern of KEY_POINT_INDICATORS) {
      if (pattern.test(line)) {
        // Clean up the line
        const cleaned = line
          .replace(/^[-•*→]\s*/, "")
          .replace(/^\d+\)\s*/, "")
          .trim();
        if (cleaned.length > 10) {
          points.push(cleaned);
        }
        break;
      }
    }
  }

  // If no bullet points, extract sentences with important keywords
  if (points.length === 0) {
    const sentences = message.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    for (const sentence of sentences) {
      if (/\b(?:key|important|focus|priority|must|critical)\b/i.test(sentence)) {
        points.push(sentence);
      }
    }
  }

  return points.slice(0, 5); // Limit to top 5
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
 * Calculate confidence based on what was extracted
 */
function calculateConfidence(update: Partial<ParsedPortfolioUpdate>): number {
  let score = 0.4; // Base score

  if (update.tickers_mentioned && update.tickers_mentioned.length > 0) score += 0.15;
  if (update.key_points && update.key_points.length > 0) score += 0.15;
  if (update.sentiment && update.sentiment !== "neutral") score += 0.1;
  if (update.market_state_mentioned) score += 0.1;
  if (update.performance_mentions && update.performance_mentions.length > 0) score += 0.1;

  return Math.min(score, 1.0);
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse a portfolio update from Discord
 *
 * @param message - Raw message content
 * @param messageDate - Date of the message
 * @returns PortfolioParseResult with parsed update or error
 */
export function parsePortfolioUpdate(message: string, messageDate?: Date): PortfolioParseResult {
  const cleaned = cleanMessage(message);

  if (cleaned.length < 10) {
    return { success: false, error: "Message too short for portfolio update" };
  }

  const { sentiment, score: sentimentScore } = analyzeSentiment(cleaned);

  const update: ParsedPortfolioUpdate = {
    update_date: (messageDate || new Date()).toISOString().split("T")[0],
    commentary: cleaned,
    sentiment,
    sentiment_score: sentimentScore,

    tickers_mentioned: extractTickers(message),
    key_points: extractKeyPoints(message),
    performance_mentions: extractPerformanceMentions(message),
    lessons: extractLessons(message),
    decisions: extractDecisions(message),

    market_state_mentioned: extractMarketState(message),
    exposure_mentioned: extractExposure(message),

    raw_message: message,
    parsed_at: new Date().toISOString(),
    confidence: 0,
    word_count: cleaned.split(/\s+/).length,
  };

  update.confidence = calculateConfidence(update);

  return { success: true, update };
}

/**
 * Parse multiple messages
 */
export function parsePortfolioUpdates(
  messages: { content: string; date?: Date }[]
): ParsedPortfolioUpdate[] {
  const updates: ParsedPortfolioUpdate[] = [];

  for (const msg of messages) {
    const result = parsePortfolioUpdate(msg.content, msg.date);
    if (result.success && result.update) {
      updates.push(result.update);
    }
  }

  return updates;
}

/**
 * Summarize multiple updates into a single view
 */
export function summarizeUpdates(updates: ParsedPortfolioUpdate[]): {
  overall_sentiment: Sentiment;
  avg_sentiment_score: number;
  all_tickers: string[];
  all_lessons: string[];
  all_key_points: string[];
  date_range: { start: string; end: string };
} {
  if (updates.length === 0) {
    return {
      overall_sentiment: "neutral",
      avg_sentiment_score: 0,
      all_tickers: [],
      all_lessons: [],
      all_key_points: [],
      date_range: { start: "", end: "" },
    };
  }

  // Calculate average sentiment
  const totalScore = updates.reduce((sum, u) => sum + u.sentiment_score, 0);
  const avgScore = totalScore / updates.length;

  let overall_sentiment: Sentiment;
  if (avgScore > 0.3) overall_sentiment = "bullish";
  else if (avgScore < -0.3) overall_sentiment = "bearish";
  else if (avgScore < 0) overall_sentiment = "cautious";
  else overall_sentiment = "neutral";

  // Collect all tickers
  const tickerSet = new Set<string>();
  for (const u of updates) {
    for (const t of u.tickers_mentioned) {
      tickerSet.add(t);
    }
  }

  // Collect lessons and key points
  const lessons = updates.flatMap(u => u.lessons);
  const keyPoints = updates.flatMap(u => u.key_points);

  // Date range
  const dates = updates.map(u => u.update_date).sort();

  return {
    overall_sentiment,
    avg_sentiment_score: avgScore,
    all_tickers: Array.from(tickerSet).sort(),
    all_lessons: [...new Set(lessons)],
    all_key_points: [...new Set(keyPoints)].slice(0, 10),
    date_range: {
      start: dates[0],
      end: dates[dates.length - 1],
    },
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
    // Bullish update
    `Market is looking constructive. Confirmed uptrend with breadth improving.
     Added to $NVDA and $META positions today. Leaders are acting well.
     Exposure at 75%.
     Key focus: Look for pullback entries on strength.`,

    // Bearish update
    `Concerning price action today. Distribution showing in leaders.
     Reduced exposure to 40%. Raised cash.
     $AAPL and $GOOGL breaking down.
     Lesson: Should have trimmed earlier when momentum faded.`,

    // Cautious update
    `Mixed signals in the market. Staying selective.
     Watching $TSLA for weakness into structure.
     Not many setups right now. Waiting for confirmation.
     Decision: Will only take A+ setups until breadth improves.`,

    // Performance update
    `Weekly review:
     • Up +3.2% for the week
     • Win rate: 65%
     • Best trade: $NVDA +2.5R
     • Worst trade: $COIN -0.8R

     Takeaway: MODE2 setups outperforming MODE1 this month.`,

    // Simple update
    `Portfolio holding steady. No changes today.
     $AMZN position working well.`,
  ];

  console.log("=".repeat(70));
  console.log("Portfolio Update Parser Test");
  console.log("=".repeat(70));
  console.log();

  for (const msg of testCases) {
    const result = parsePortfolioUpdate(msg);
    console.log(`Message: "${msg.slice(0, 60).replace(/\n/g, " ")}..."`);
    if (result.success && result.update) {
      console.log(`  ✓ Parsed successfully`);
      console.log(`    Sentiment: ${result.update.sentiment} (${result.update.sentiment_score.toFixed(2)})`);
      console.log(`    Tickers: ${result.update.tickers_mentioned.join(", ") || "none"}`);
      console.log(`    Key Points: ${result.update.key_points.length}`);
      console.log(`    Lessons: ${result.update.lessons.length}`);
      console.log(`    Performance: ${result.update.performance_mentions.length} mentions`);
      console.log(`    Market State: ${result.update.market_state_mentioned || "N/A"}`);
      console.log(`    Exposure: ${result.update.exposure_mentioned !== null ? result.update.exposure_mentioned + "%" : "N/A"}`);
      console.log(`    Confidence: ${(result.update.confidence * 100).toFixed(0)}%`);
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
  parsePortfolioUpdate,
  parsePortfolioUpdates,
  summarizeUpdates,
  testParser,
};
