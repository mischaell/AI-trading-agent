/**
 * Discord #gameplan-focuslist Channel Parser
 *
 * Parses "SITUATIONAL AWARENESS, GAMEPLAN, and TOP IDEAS" messages.
 *
 * Format:
 * SITUATIONAL AWARENESS, GAMEPLAN, and TOP IDEAS MM/DD
 * SITUATIONAL AWARENESS
 * <market commentary>
 * GAMEPLAN
 * <plan text>
 * TOP IDEAS
 * TICKER1, TICKER2, TICKER3, ...
 *
 * @module discord/parsers/gameplan
 */

// =============================================================================
// Types
// =============================================================================

export interface ParsedGameplan {
  post_date: string; // ISO date
  situational_awareness: string;
  gameplan: string;
  top_ideas: string[]; // Ticker array
  raw_message: string;
  parsed_at: string;
  confidence: number;
}

export interface GameplanParseResult {
  success: boolean;
  gameplan?: ParsedGameplan;
  error?: string;
}

// =============================================================================
// Parser
// =============================================================================

const TICKER_RE = /\b[A-Z]{2,5}\b/g;

const EXCLUDED_WORDS = new Set([
  "SITUATIONAL", "AWARENESS", "GAMEPLAN", "TOP", "IDEAS", "AND",
  "THE", "FOR", "WITH", "FROM", "INTO", "THAT", "THIS", "HAVE",
  "NOT", "ARE", "BUT", "ALL", "CAN", "HAS", "HER", "WAS", "ONE",
  "OUR", "OUT", "DAY", "GET", "GOT", "ITS", "MAY", "NEW", "NOW",
  "OLD", "SEE", "WAY", "WHO", "DID", "LET", "SAY", "SHE", "TOO",
  "USE", "KEY", "KNOW", "RISK", "FLAT", "STILL", "CLOSE", "IMAGE",
  "BELOW", "ABOVE", "RISING", "DO", "WE", "MY", "IF", "SO", "OR",
  "IS", "IT", "AT", "TO", "IN", "ON", "UP", "BE", "AS", "NO",
  "UNTIL", "SIT", "REMAIN", "TREAD", "WATER", "PATIENCE",
  "CONTROLLED", "KNOWN", "PREFER", "SIGNALS",
  "FOLLOW", "THROUGH", "LOWER", "RECLAIM", "SPOT", "TOMORROW",
  "REJECTION", "DECLINING", "CROSSOVER", "IMPORTANT", "SHAKEOUT",
  "TODAY", "INVESTED", "DISENGAGED",
  "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
]);

/**
 * Parse a gameplan-focuslist message
 */
export function parseGameplan(message: string, messageDate?: Date): GameplanParseResult {
  // Strip markdown headers (# / ## / ###)
  const cleaned = message.replace(/^#{1,3}\s*/gm, "").trim();
  if (!cleaned) {
    return { success: false, error: "Empty message" };
  }

  // Find the TOP IDEAS section header (last occurrence, skipping title line)
  const upper = cleaned.toUpperCase();
  let topIdeasIdx = upper.lastIndexOf("TOP IDEAS");
  if (topIdeasIdx === -1) {
    return { success: false, error: "No TOP IDEAS section found" };
  }

  // Extract date from header (MM/DD format), use messageDate for year
  const dateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})/);
  let postDate: string;
  if (dateMatch && messageDate) {
    const month = dateMatch[1].padStart(2, "0");
    const day = dateMatch[2].padStart(2, "0");
    // Use the year from the Discord message timestamp
    const year = messageDate.getFullYear();
    postDate = `${year}-${month}-${day}`;
  } else if (dateMatch) {
    const month = dateMatch[1].padStart(2, "0");
    const day = dateMatch[2].padStart(2, "0");
    const year = new Date().getFullYear();
    postDate = `${year}-${month}-${day}`;
  } else if (messageDate) {
    postDate = messageDate.toISOString().split("T")[0];
  } else {
    postDate = new Date().toISOString().split("T")[0];
  }

  // Find section headers as standalone lines
  const lines = cleaned.split("\n");
  let saStart = -1, gpStart = -1, tiStart = -1;
  let charIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toUpperCase();
    if (line === "SITUATIONAL AWARENESS") saStart = charIdx + lines[i].indexOf(lines[i].trim());
    if (line === "GAMEPLAN" || line === "GAMEPLAN:") gpStart = charIdx + lines[i].indexOf(lines[i].trim());
    if (line === "TOP IDEAS" || line === "TOP IDEAS:") tiStart = charIdx + lines[i].indexOf(lines[i].trim());
    charIdx += lines[i].length + 1; // +1 for \n
  }
  // Fall back to lastIndexOf if standalone line not found
  if (tiStart === -1) tiStart = topIdeasIdx;

  let situationalAwareness = "";
  let gameplan = "";

  if (saStart !== -1 && gpStart !== -1 && gpStart > saStart) {
    situationalAwareness = cleaned
      .substring(saStart + "SITUATIONAL AWARENESS".length, gpStart)
      .trim();
  }

  if (gpStart !== -1 && tiStart > gpStart) {
    gameplan = cleaned
      .substring(gpStart + "GAMEPLAN".length, tiStart)
      .trim();
  }

  // Extract tickers from TOP IDEAS section
  const topIdeasText = cleaned.substring(tiStart + "TOP IDEAS".length).trim();
  // Take only the first line/paragraph (before any "Image" or newline gap)
  const tickerLine = topIdeasText.split(/\n\s*\n/)[0].split(/\bImage\b/i)[0].trim();

  const rawTickers = tickerLine.match(TICKER_RE) || [];
  const topIdeas = rawTickers.filter((t) => !EXCLUDED_WORDS.has(t) && t.length >= 2);

  if (topIdeas.length === 0) {
    return { success: false, error: "No tickers found in TOP IDEAS" };
  }

  // Confidence based on structure
  let confidence = 0.5;
  if (situationalAwareness.length > 10) confidence += 0.15;
  if (gameplan.length > 10) confidence += 0.15;
  if (topIdeas.length >= 3) confidence += 0.2;

  return {
    success: true,
    gameplan: {
      post_date: postDate,
      situational_awareness: situationalAwareness,
      gameplan,
      top_ideas: topIdeas,
      raw_message: cleaned,
      parsed_at: new Date().toISOString(),
      confidence: Math.min(confidence, 1),
    },
  };
}

export default { parseGameplan };
