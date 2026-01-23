/**
 * Alex Trading State Analyzer
 *
 * Extracts Alex's trading states from journal entries:
 * - TESTING: Small pilot positions to test market conditions
 * - PRESSING: Adding aggressively with positive delta/cushion
 * - TRIMMING: Reducing exposure systematically into strength
 * - DEFENSIVE: Risk-off mode, capital preservation priority
 *
 * Run with: npx tsx src/lib/backtest/alex-states.ts
 *
 * @module backtest/alex-states
 */

import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Types
// =============================================================================

export type AlexState = "TESTING" | "PRESSING" | "TRIMMING" | "DEFENSIVE" | "SELLING" | "NEUTRAL";

export interface JournalEntry {
  date: string;
  timestamp: string;
  content: string;
  hasAttachment: boolean;
}

export interface StateSignal {
  state: AlexState;
  confidence: number;      // 0-1
  keywords: string[];      // Matched keywords
  context: string;         // Relevant snippet
}

export interface DailyState {
  date: string;
  primaryState: AlexState;
  signals: StateSignal[];
  entries: JournalEntry[];
  summary: {
    testingScore: number;
    pressingScore: number;
    trimmingScore: number;
    defensiveScore: number;
    sellingScore: number;
  };
}

// =============================================================================
// State Detection Patterns
// =============================================================================

const STATE_PATTERNS: Record<AlexState, { keywords: string[]; phrases: string[]; weight: number; excludePatterns?: string[] }> = {
  TESTING: {
    keywords: [
      "pilot", "small risk", "small position",
      "0.125%", "0.25%", "0.25ec", "0.125ec"
    ],
    phrases: [
      "testing the group", "testing the semi", "testing it", "test this setup",
      "trying a small", "trying this", "small pilot", "pilot position",
      "low risk entry", "tight risk only", "will know fast if wrong",
      "want to test this", "testing that bounce", "testing on", "test only"
    ],
    excludePatterns: ["backtest", "retest", "stress-test", "stress test"],
    weight: 1.0
  },

  PRESSING: {
    keywords: [
      "press", "pressing", "aggressive", "agressive", "fully invested",
      "ramp up", "scale up"
    ],
    phrases: [
      "allow myself to push", "allow myself to be more aggressive",
      "delta positive", "delta is positive", "cushion allow",
      "traction allow", "got traction", "gaining cushion", "positive delta",
      "fully invested", "aggressive progressive", "press a bit",
      "push a bit", "allow myself to", "i am being aggressive",
      "adding to my", "adding to core", "add long", "add-on",
      "adding another", "adding back"
    ],
    weight: 1.2
  },

  TRIMMING: {
    keywords: [
      "trim", "trimming", "trimmed", "reducing", "reduce exposure",
      "scale down", "scaling down", "lightening", "1/3 runner", "runners"
    ],
    phrases: [
      "trim into strength", "trimming into strength", "reduce my exposure",
      "reducing exposure", "down to 1/3", "taking profits", "lock in gains",
      "securing profits", "scale down exposure", "trim my extended",
      "trim at the close", "another trim", "continue to trim"
    ],
    weight: 1.0
  },

  DEFENSIVE: {
    keywords: [
      "defensive", "capital preservation", "risk-off", "risk off",
      "dangerous", "no trades", "sitting tight", "protect"
    ],
    phrases: [
      "cash is a position", "cash is position", "capital preservation",
      "no trades planned", "protect your capital", "be safe",
      "dangerous market", "not to be aggressive", "less is more",
      "choppy market", "nothing to do", "fat pitch is not here",
      "manage my risk", "managing risk", "reduce exposure"
    ],
    weight: 1.2
  },

  SELLING: {
    keywords: [
      "all cash", "zero exposure"
    ],
    phrases: [
      // QQQE structure loss - primary trigger (highest priority)
      "qqqe below 21dma-structure", "qqqe losing the 21dma-structure",
      "qqqe closing below 21dma-structure", "qqqe lost the 21dma",
      "qqqe below 21dma", "qqqe losing 21dma",
      // All cash signals
      "going all cash", "going to cash",
      "closed all positions", "closing all positions",
      "sold everything", "new exposure will be closed",
      // Clear risk-off actions
      "clear risk-off", "time to sit on hands",
      "downtrend must be respected", "end of rally attempt"
    ],
    weight: 2.5  // Highest weight - QQQE structure loss overrides everything
  },

  NEUTRAL: {
    keywords: [],
    phrases: [],
    weight: 0
  }
};

// =============================================================================
// State Detection Functions
// =============================================================================

function detectState(content: string): StateSignal[] {
  const signals: StateSignal[] = [];
  const lowerContent = content.toLowerCase();

  for (const [state, patterns] of Object.entries(STATE_PATTERNS)) {
    if (state === "NEUTRAL") continue;

    // Check exclude patterns first
    const excludePatterns = (patterns as any).excludePatterns as string[] | undefined;
    let shouldExclude = false;
    if (excludePatterns) {
      for (const exclude of excludePatterns) {
        if (lowerContent.includes(exclude.toLowerCase())) {
          shouldExclude = true;
          break;
        }
      }
    }

    const matchedKeywords: string[] = [];
    let score = 0;

    // Check keywords (skip if excluded)
    for (const keyword of patterns.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (lowerContent.includes(keywordLower)) {
        // For "test" keyword, make sure it's not part of backtest/retest
        if (keywordLower === "test" && shouldExclude) continue;
        matchedKeywords.push(keyword);
        score += 1;
      }
    }

    // Check phrases (higher weight)
    for (const phrase of patterns.phrases) {
      if (lowerContent.includes(phrase.toLowerCase())) {
        matchedKeywords.push(phrase);
        score += 2;
      }
    }

    if (score > 0) {
      // Find relevant context (snippet around first match)
      const firstMatch = matchedKeywords[0].toLowerCase();
      const idx = lowerContent.indexOf(firstMatch);
      const start = Math.max(0, idx - 50);
      const end = Math.min(content.length, idx + 100);
      const context = content.substring(start, end).trim();

      signals.push({
        state: state as AlexState,
        confidence: Math.min(1, score * patterns.weight / 5),
        keywords: matchedKeywords,
        context: context.length > 150 ? context.substring(0, 147) + "..." : context
      });
    }
  }

  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);

  return signals;
}

function determinePrimaryState(signals: StateSignal[]): AlexState {
  if (signals.length === 0) return "NEUTRAL";

  // Calculate aggregate scores
  const scores: Record<AlexState, number> = {
    TESTING: 0,
    PRESSING: 0,
    TRIMMING: 0,
    DEFENSIVE: 0,
    SELLING: 0,
    NEUTRAL: 0
  };

  for (const signal of signals) {
    scores[signal.state] += signal.confidence;
  }

  // Find highest score
  let maxState: AlexState = "NEUTRAL";
  let maxScore = 0;

  for (const [state, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxState = state as AlexState;
    }
  }

  return maxState;
}

// =============================================================================
// Journal Loading
// =============================================================================

interface DiscordMessage {
  id: string;
  timestamp: string;
  content: string;
  attachments: { fileName: string }[];
}

interface DiscordExport {
  messages: DiscordMessage[];
}

function loadJournalEntries(filePath: string): JournalEntry[] {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as DiscordExport;
  const entries: JournalEntry[] = [];

  for (const msg of data.messages) {
    if (!msg.content || msg.content.trim() === "") continue;

    const date = msg.timestamp.split("T")[0];
    entries.push({
      date,
      timestamp: msg.timestamp,
      content: msg.content,
      hasAttachment: msg.attachments && msg.attachments.length > 0
    });
  }

  return entries;
}

// =============================================================================
// Daily State Aggregation
// =============================================================================

function aggregateDailyStates(entries: JournalEntry[]): Map<string, DailyState> {
  const dailyStates = new Map<string, DailyState>();

  for (const entry of entries) {
    const signals = detectState(entry.content);

    if (!dailyStates.has(entry.date)) {
      dailyStates.set(entry.date, {
        date: entry.date,
        primaryState: "NEUTRAL",
        signals: [],
        entries: [],
        summary: {
          testingScore: 0,
          pressingScore: 0,
          trimmingScore: 0,
          defensiveScore: 0,
          sellingScore: 0
        }
      });
    }

    const daily = dailyStates.get(entry.date)!;
    daily.entries.push(entry);
    daily.signals.push(...signals);

    // Aggregate scores
    for (const signal of signals) {
      switch (signal.state) {
        case "TESTING":
          daily.summary.testingScore += signal.confidence;
          break;
        case "PRESSING":
          daily.summary.pressingScore += signal.confidence;
          break;
        case "TRIMMING":
          daily.summary.trimmingScore += signal.confidence;
          break;
        case "DEFENSIVE":
          daily.summary.defensiveScore += signal.confidence;
          break;
        case "SELLING":
          daily.summary.sellingScore += signal.confidence;
          break;
      }
    }
  }

  // Determine primary state for each day
  for (const daily of dailyStates.values()) {
    daily.primaryState = determinePrimaryState(daily.signals);
  }

  return dailyStates;
}

// =============================================================================
// Analysis & Reporting
// =============================================================================

function analyzeStateTransitions(dailyStates: Map<string, DailyState>): void {
  const dates = Array.from(dailyStates.keys()).sort();

  console.log("\n" + "=".repeat(80));
  console.log("                       ALEX STATE TRANSITION ANALYSIS");
  console.log("=".repeat(80));

  // State distribution
  const stateCounts: Record<AlexState, number> = {
    TESTING: 0,
    PRESSING: 0,
    TRIMMING: 0,
    DEFENSIVE: 0,
    SELLING: 0,
    NEUTRAL: 0
  };

  for (const daily of dailyStates.values()) {
    stateCounts[daily.primaryState]++;
  }

  console.log("\n📊 STATE DISTRIBUTION:");
  console.log("─".repeat(40));
  const total = dates.length;
  for (const [state, count] of Object.entries(stateCounts)) {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / total * 30));
    console.log(`  ${state.padEnd(12)} ${String(count).padStart(4)} days (${pct.padStart(5)}%) ${bar}`);
  }

  // State transitions
  console.log("\n📈 STATE TRANSITIONS:");
  console.log("─".repeat(40));

  let prevState: AlexState | null = null;
  const transitions: { from: AlexState; to: AlexState; date: string }[] = [];

  for (const date of dates) {
    const daily = dailyStates.get(date)!;
    if (prevState && prevState !== daily.primaryState && daily.primaryState !== "NEUTRAL") {
      transitions.push({ from: prevState, to: daily.primaryState, date });
    }
    if (daily.primaryState !== "NEUTRAL") {
      prevState = daily.primaryState;
    }
  }

  // Show last 20 transitions
  const recentTransitions = transitions.slice(-20);
  for (const t of recentTransitions) {
    console.log(`  ${t.date}  ${t.from.padEnd(10)} → ${t.to}`);
  }

  console.log(`\n  Total transitions: ${transitions.length}`);
}

function printDailyStateTable(dailyStates: Map<string, DailyState>, limit: number = 30): void {
  const dates = Array.from(dailyStates.keys()).sort().slice(-limit);

  console.log("\n" + "=".repeat(100));
  console.log("                              DAILY ALEX STATES (Last " + limit + " days)");
  console.log("=".repeat(100));
  console.log("┌────────────┬────────────┬─────────┬─────────┬─────────┬─────────┬─────────┬────────────────────────┐");
  console.log("│    Date    │   State    │ Testing │ Pressing│ Trimming│Defensive│ Selling │ Top Signal             │");
  console.log("├────────────┼────────────┼─────────┼─────────┼─────────┼─────────┼─────────┼────────────────────────┤");

  for (const date of dates) {
    const daily = dailyStates.get(date)!;
    const s = daily.summary;
    const topSignal = daily.signals.length > 0
      ? daily.signals[0].keywords[0]?.substring(0, 22) || ""
      : "";

    console.log(
      `│ ${date} │ ${daily.primaryState.padEnd(10)} │ ` +
      `${s.testingScore.toFixed(1).padStart(7)} │ ` +
      `${s.pressingScore.toFixed(1).padStart(7)} │ ` +
      `${s.trimmingScore.toFixed(1).padStart(7)} │ ` +
      `${s.defensiveScore.toFixed(1).padStart(7)} │ ` +
      `${s.sellingScore.toFixed(1).padStart(7)} │ ` +
      `${topSignal.padEnd(22)} │`
    );
  }

  console.log("└────────────┴────────────┴─────────┴─────────┴─────────┴─────────┴─────────┴────────────────────────┘");
}

function exportDailyStates(dailyStates: Map<string, DailyState>): object[] {
  const results: object[] = [];
  const dates = Array.from(dailyStates.keys()).sort();

  for (const date of dates) {
    const daily = dailyStates.get(date)!;
    results.push({
      date: daily.date,
      state: daily.primaryState,
      scores: daily.summary,
      signalCount: daily.signals.length,
      entryCount: daily.entries.length
    });
  }

  return results;
}

// =============================================================================
// Market Correlation Analysis
// =============================================================================

interface TradeOutcome {
  date: string;
  ticker: string;
  action: string;
  rMultiple: number | null;
  gainPct: number | null;
}

function loadTradesForCorrelation(tradesPath: string): TradeOutcome[] {
  if (!fs.existsSync(tradesPath)) return [];

  const data = JSON.parse(fs.readFileSync(tradesPath, "utf8"));
  const outcomes: TradeOutcome[] = [];

  for (const msg of data.messages || []) {
    if (!msg.content) continue;
    const content = msg.content;
    const date = msg.timestamp.split("T")[0];

    // Parse trade outcomes
    // Entry pattern: "Long 11% TICKER @ price"
    const entryMatch = content.match(/^(Long|Short)\s+(\d+)%?\s+(\$?[A-Z]+)/i);
    // Close pattern: "Closed TICKER (date) @ gain% (price)"
    const closeMatch = content.match(/Closed\s+(\$?[A-Z]+).*?@\s*([+-]?\d+\.?\d*)%/i);
    // Trim pattern: "Trimmed 1/3 TICKER"
    const trimMatch = content.match(/Trimmed.*?(\$?[A-Z]+)/i);
    // Stop pattern: "Stopped out TICKER @ -1R"
    const stopMatch = content.match(/Stopped\s+out\s+(\$?[A-Z]+).*?([+-]?\d+\.?\d*)R/i);

    if (closeMatch) {
      outcomes.push({
        date,
        ticker: closeMatch[1].replace("$", ""),
        action: "CLOSE",
        rMultiple: null,
        gainPct: parseFloat(closeMatch[2])
      });
    } else if (stopMatch) {
      outcomes.push({
        date,
        ticker: stopMatch[1].replace("$", ""),
        action: "STOP",
        rMultiple: parseFloat(stopMatch[2]),
        gainPct: null
      });
    } else if (trimMatch && content.toLowerCase().includes("r")) {
      // Try to extract R multiple from trim
      const rMatch = content.match(/(\d+)R/);
      if (rMatch) {
        outcomes.push({
          date,
          ticker: trimMatch[1].replace("$", ""),
          action: "TRIM",
          rMultiple: parseFloat(rMatch[1]),
          gainPct: null
        });
      }
    }
  }

  return outcomes;
}

function correlateStatesWithOutcomes(
  dailyStates: Map<string, DailyState>,
  trades: TradeOutcome[]
): void {
  console.log("\n" + "=".repeat(80));
  console.log("                    ALEX STATE vs TRADE OUTCOME CORRELATION");
  console.log("=".repeat(80));

  // Group trades by Alex state on that day
  const stateOutcomes: Record<AlexState, { wins: number; losses: number; totalR: number; count: number }> = {
    TESTING: { wins: 0, losses: 0, totalR: 0, count: 0 },
    PRESSING: { wins: 0, losses: 0, totalR: 0, count: 0 },
    TRIMMING: { wins: 0, losses: 0, totalR: 0, count: 0 },
    DEFENSIVE: { wins: 0, losses: 0, totalR: 0, count: 0 },
    SELLING: { wins: 0, losses: 0, totalR: 0, count: 0 },
    NEUTRAL: { wins: 0, losses: 0, totalR: 0, count: 0 }
  };

  for (const trade of trades) {
    const daily = dailyStates.get(trade.date);
    const state = daily?.primaryState || "NEUTRAL";

    stateOutcomes[state].count++;

    if (trade.rMultiple !== null) {
      stateOutcomes[state].totalR += trade.rMultiple;
      if (trade.rMultiple > 0) {
        stateOutcomes[state].wins++;
      } else {
        stateOutcomes[state].losses++;
      }
    } else if (trade.gainPct !== null) {
      if (trade.gainPct > 0) {
        stateOutcomes[state].wins++;
      } else {
        stateOutcomes[state].losses++;
      }
    }
  }

  console.log("\n📊 OUTCOMES BY ALEX STATE:");
  console.log("─".repeat(70));
  console.log("│ State      │ Trades │ Wins │ Losses │ Win Rate │ Avg R    │ Total R  │");
  console.log("├────────────┼────────┼──────┼────────┼──────────┼──────────┼──────────┤");

  for (const [state, data] of Object.entries(stateOutcomes)) {
    if (data.count === 0) continue;
    const winRate = data.wins + data.losses > 0
      ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1)
      : "N/A";
    const avgR = data.wins + data.losses > 0
      ? (data.totalR / (data.wins + data.losses)).toFixed(2)
      : "N/A";

    console.log(
      `│ ${state.padEnd(10)} │ ` +
      `${String(data.count).padStart(6)} │ ` +
      `${String(data.wins).padStart(4)} │ ` +
      `${String(data.losses).padStart(6)} │ ` +
      `${String(winRate).padStart(7)}% │ ` +
      `${String(avgR).padStart(8)} │ ` +
      `${data.totalR.toFixed(1).padStart(8)} │`
    );
  }

  console.log("└────────────┴────────┴──────┴────────┴──────────┴──────────┴──────────┘");

  // Recommendations
  console.log("\n💡 RECOMMENDATIONS:");
  console.log("─".repeat(40));

  const testingWR = stateOutcomes.TESTING.wins + stateOutcomes.TESTING.losses > 0
    ? stateOutcomes.TESTING.wins / (stateOutcomes.TESTING.wins + stateOutcomes.TESTING.losses)
    : 0;
  const pressingWR = stateOutcomes.PRESSING.wins + stateOutcomes.PRESSING.losses > 0
    ? stateOutcomes.PRESSING.wins / (stateOutcomes.PRESSING.wins + stateOutcomes.PRESSING.losses)
    : 0;

  if (stateOutcomes.DEFENSIVE.count > 5) {
    console.log("  • DEFENSIVE mode detected - reduce new entries, protect capital");
  }
  if (pressingWR > 0.6 && stateOutcomes.PRESSING.count > 5) {
    console.log("  • PRESSING mode shows high win rate - consider adding to winners");
  }
  if (testingWR < 0.4 && stateOutcomes.TESTING.count > 5) {
    console.log("  • TESTING trades underperforming - keep pilots small");
  }
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const format = args[0] || "table"; // "table", "json", "analyze", or "correlate"

  const journalPath = path.join(
    process.cwd(),
    "data/discord-exports/alex-journal.json"
  );

  if (!fs.existsSync(journalPath)) {
    console.error(`Journal file not found: ${journalPath}`);
    console.error("Please export alex-journal from Discord first.");
    process.exit(1);
  }

  console.log("Loading alex-journal entries...");
  const entries = loadJournalEntries(journalPath);
  console.log(`Loaded ${entries.length} journal entries`);

  console.log("Analyzing trading states...");
  const dailyStates = aggregateDailyStates(entries);
  console.log(`Analyzed ${dailyStates.size} trading days`);

  switch (format) {
    case "json":
      console.log(JSON.stringify(exportDailyStates(dailyStates), null, 2));
      break;

    case "analyze":
      analyzeStateTransitions(dailyStates);
      printDailyStateTable(dailyStates, 50);
      break;

    case "correlate": {
      // Load equity trades and correlate with states
      const tradesPath = path.join(
        process.cwd(),
        "data/discord-exports/equity-trades.json"
      );
      const trades = loadTradesForCorrelation(tradesPath);
      console.log(`Loaded ${trades.length} trade outcomes`);

      printDailyStateTable(dailyStates, 30);
      analyzeStateTransitions(dailyStates);
      correlateStatesWithOutcomes(dailyStates, trades);
      break;
    }

    case "table":
    default:
      printDailyStateTable(dailyStates, 30);
      analyzeStateTransitions(dailyStates);
      break;
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  detectState,
  determinePrimaryState,
  loadJournalEntries,
  aggregateDailyStates,
  exportDailyStates,
  STATE_PATTERNS
};

// Run if executed directly
main().catch(console.error);
