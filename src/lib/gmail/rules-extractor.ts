/**
 * Rules Extractor for Trading Reports
 *
 * Analyzes imported daily reports to extract trading patterns and rules.
 * Helps validate and refine rules in agent_skeleton based on historical data.
 *
 * @see docs/agent_skeleton_v1.0.md for trading rules reference
 */

import { createClient } from "@supabase/supabase-js";
import type { DailyReport } from "@/types/daily-report";

// =============================================================================
// Types
// =============================================================================

export interface PatternCount {
  pattern: string;
  count: number;
  percentage: number;
  examples: string[]; // report dates
}

export interface ConditionAction {
  condition: string;
  actions: {
    action: string;
    count: number;
    percentage: number;
  }[];
  totalOccurrences: number;
}

export interface ExtractedRules {
  // Market State Rules
  qqqeAboveActions: ConditionAction;
  qqqeBelowActions: ConditionAction;
  qqqeInsideActions: ConditionAction;

  // Breadth Rules
  mcsiAbove10dmaActions: ConditionAction;
  mcsiBelow10dmaActions: ConditionAction;
  mcoOversoldActions: ConditionAction;
  mcoOverboughtActions: ConditionAction;

  // Signal Patterns
  tlmmSignalDistribution: PatternCount[];
  pullbackFrequency: {
    avgPullbackCount: number;
    avgUniverseCount: number;
    pullbackToUniverseRatio: number;
  };

  // Combined Patterns
  greenLightConditions: PatternCount[]; // Conditions when pullbacks were recommended
  redFlagConditions: PatternCount[];    // Conditions when caution was recommended

  // Summary
  totalReportsAnalyzed: number;
  dateRange: { start: string; end: string };
  extractedAt: string;
}

export interface RuleRecommendation {
  rule: string;
  confidence: number; // 0-1 based on data support
  supporting_data: string;
  suggested_addition?: string;
}

// =============================================================================
// Supabase Client
// =============================================================================

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, key);
}

// =============================================================================
// Data Loading
// =============================================================================

/**
 * Load all daily reports from Supabase
 */
export async function loadAllReports(): Promise<DailyReport[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .order("report_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to load reports: ${error.message}`);
  }

  return data || [];
}

/**
 * Load reports in a date range
 */
export async function loadReportsInRange(
  startDate: string,
  endDate: string
): Promise<DailyReport[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to load reports: ${error.message}`);
  }

  return data || [];
}

// =============================================================================
// Pattern Analysis Functions
// =============================================================================

/**
 * Analyze actions taken given a specific QQQE position
 */
function analyzeQqqePositionActions(
  reports: DailyReport[],
  position: "above" | "below" | "inside"
): ConditionAction {
  const filtered = reports.filter((r) => r.qqqe_position === position);
  const actionCounts = new Map<string, number>();

  for (const report of filtered) {
    const action = normalizeAction(report.market_action || "unknown");
    actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
  }

  const total = filtered.length;
  const actions = Array.from(actionCounts.entries())
    .map(([action, count]) => ({
      action,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    condition: `QQQE ${position} cloud`,
    actions,
    totalOccurrences: total,
  };
}

/**
 * Analyze actions given MCSI vs 10DMA position
 */
function analyzeMcsiPositionActions(
  reports: DailyReport[],
  position: "above" | "below"
): ConditionAction {
  const filtered = reports.filter((r) => r.mcsi_vs_10dma === position);
  const actionCounts = new Map<string, number>();

  for (const report of filtered) {
    const action = normalizeAction(report.market_action || "unknown");
    actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
  }

  const total = filtered.length;
  const actions = Array.from(actionCounts.entries())
    .map(([action, count]) => ({
      action,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    condition: `MCSI ${position} 10DMA`,
    actions,
    totalOccurrences: total,
  };
}

/**
 * Analyze actions given MCO status
 */
function analyzeMcoStatusActions(
  reports: DailyReport[],
  status: "oversold" | "overbought"
): ConditionAction {
  const filtered = reports.filter((r) => r.mco_status === status);
  const actionCounts = new Map<string, number>();

  for (const report of filtered) {
    const action = normalizeAction(report.market_action || "unknown");
    actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
  }

  const total = filtered.length;
  const actions = Array.from(actionCounts.entries())
    .map(([action, count]) => ({
      action,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    condition: `MCO ${status}`,
    actions,
    totalOccurrences: total,
  };
}

/**
 * Analyze TLMM signal distribution
 */
function analyzeTlmmSignals(reports: DailyReport[]): PatternCount[] {
  const signalCounts = new Map<string, { count: number; examples: string[] }>();

  for (const report of reports) {
    const signal = report.tlmm_signal || "unknown";
    const existing = signalCounts.get(signal) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 5) {
      existing.examples.push(report.report_date);
    }
    signalCounts.set(signal, existing);
  }

  const total = reports.length;
  return Array.from(signalCounts.entries())
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      percentage: total > 0 ? (data.count / total) * 100 : 0,
      examples: data.examples,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Analyze pullback frequency
 */
function analyzePullbackFrequency(reports: DailyReport[]): {
  avgPullbackCount: number;
  avgUniverseCount: number;
  pullbackToUniverseRatio: number;
} {
  const pullbackCounts = reports.map((r) => r.pullback_count || 0);
  const universeCounts = reports.map((r) => r.universe_count || 0);

  const avgPullback =
    pullbackCounts.reduce((a, b) => a + b, 0) / reports.length || 0;
  const avgUniverse =
    universeCounts.reduce((a, b) => a + b, 0) / reports.length || 0;

  return {
    avgPullbackCount: avgPullback,
    avgUniverseCount: avgUniverse,
    pullbackToUniverseRatio: avgUniverse > 0 ? avgPullback / avgUniverse : 0,
  };
}

/**
 * Find "green light" conditions - when pullbacks were active
 */
function findGreenLightConditions(reports: DailyReport[]): PatternCount[] {
  const patterns = new Map<string, { count: number; examples: string[] }>();

  for (const report of reports) {
    // Consider "green light" when pullback count >= 3
    if ((report.pullback_count || 0) >= 3) {
      const conditions: string[] = [];

      if (report.qqqe_position) {
        conditions.push(`QQQE_${report.qqqe_position}`);
      }
      if (report.mcsi_vs_10dma) {
        conditions.push(`MCSI_${report.mcsi_vs_10dma}_10DMA`);
      }
      if (report.mco_status && report.mco_status !== "neutral") {
        conditions.push(`MCO_${report.mco_status}`);
      }
      if (report.tlmm_signal) {
        conditions.push(`TLMM_${report.tlmm_signal}`);
      }

      const pattern = conditions.sort().join(" + ");
      if (pattern) {
        const existing = patterns.get(pattern) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(report.report_date);
        }
        patterns.set(pattern, existing);
      }
    }
  }

  const total = reports.filter((r) => (r.pullback_count || 0) >= 3).length;
  return Array.from(patterns.entries())
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      percentage: total > 0 ? (data.count / total) * 100 : 0,
      examples: data.examples,
    }))
    .filter((p) => p.count >= 2) // At least 2 occurrences
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Find "red flag" conditions - when action was defensive/wait
 */
function findRedFlagConditions(reports: DailyReport[]): PatternCount[] {
  const patterns = new Map<string, { count: number; examples: string[] }>();

  for (const report of reports) {
    const action = normalizeAction(report.market_action || "");
    const isDefensive =
      action.includes("wait") ||
      action.includes("defensive") ||
      action.includes("reduce") ||
      action.includes("caution");

    if (isDefensive) {
      const conditions: string[] = [];

      if (report.qqqe_position) {
        conditions.push(`QQQE_${report.qqqe_position}`);
      }
      if (report.mcsi_vs_10dma) {
        conditions.push(`MCSI_${report.mcsi_vs_10dma}_10DMA`);
      }
      if (report.mco_status) {
        conditions.push(`MCO_${report.mco_status}`);
      }
      if (report.qqqe_structure_slope) {
        conditions.push(`Slope_${report.qqqe_structure_slope}`);
      }

      const pattern = conditions.sort().join(" + ");
      if (pattern) {
        const existing = patterns.get(pattern) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(report.report_date);
        }
        patterns.set(pattern, existing);
      }
    }
  }

  const defensiveCount = reports.filter((r) => {
    const action = normalizeAction(r.market_action || "");
    return (
      action.includes("wait") ||
      action.includes("defensive") ||
      action.includes("reduce")
    );
  }).length;

  return Array.from(patterns.entries())
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      percentage: defensiveCount > 0 ? (data.count / defensiveCount) * 100 : 0,
      examples: data.examples,
    }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize action string for comparison
 */
function normalizeAction(action: string): string {
  return action
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

// =============================================================================
// Main Extraction Function
// =============================================================================

/**
 * Extract trading rules and patterns from imported reports
 *
 * @param reports - Array of daily reports to analyze
 * @returns Extracted rules and patterns
 */
export function extractRulesFromReports(reports: DailyReport[]): ExtractedRules {
  if (reports.length === 0) {
    throw new Error("No reports to analyze");
  }

  const sortedReports = [...reports].sort(
    (a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
  );

  return {
    // Market State Rules
    qqqeAboveActions: analyzeQqqePositionActions(reports, "above"),
    qqqeBelowActions: analyzeQqqePositionActions(reports, "below"),
    qqqeInsideActions: analyzeQqqePositionActions(reports, "inside"),

    // Breadth Rules
    mcsiAbove10dmaActions: analyzeMcsiPositionActions(reports, "above"),
    mcsiBelow10dmaActions: analyzeMcsiPositionActions(reports, "below"),
    mcoOversoldActions: analyzeMcoStatusActions(reports, "oversold"),
    mcoOverboughtActions: analyzeMcoStatusActions(reports, "overbought"),

    // Signal Patterns
    tlmmSignalDistribution: analyzeTlmmSignals(reports),
    pullbackFrequency: analyzePullbackFrequency(reports),

    // Combined Patterns
    greenLightConditions: findGreenLightConditions(reports),
    redFlagConditions: findRedFlagConditions(reports),

    // Summary
    totalReportsAnalyzed: reports.length,
    dateRange: {
      start: sortedReports[0].report_date,
      end: sortedReports[sortedReports.length - 1].report_date,
    },
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Generate rule recommendations based on extracted patterns
 */
export function generateRuleRecommendations(
  rules: ExtractedRules
): RuleRecommendation[] {
  const recommendations: RuleRecommendation[] = [];

  // Analyze QQQE above patterns
  if (rules.qqqeAboveActions.totalOccurrences >= 10) {
    const topAction = rules.qqqeAboveActions.actions[0];
    if (topAction && topAction.percentage > 60) {
      recommendations.push({
        rule: `When QQQE is ABOVE cloud, primary action is "${topAction.action}"`,
        confidence: topAction.percentage / 100,
        supporting_data: `${topAction.count}/${rules.qqqeAboveActions.totalOccurrences} occurrences (${topAction.percentage.toFixed(1)}%)`,
      });
    }
  }

  // Analyze QQQE below patterns
  if (rules.qqqeBelowActions.totalOccurrences >= 5) {
    const topAction = rules.qqqeBelowActions.actions[0];
    if (topAction && topAction.percentage > 50) {
      recommendations.push({
        rule: `When QQQE is BELOW cloud, primary action is "${topAction.action}"`,
        confidence: topAction.percentage / 100,
        supporting_data: `${topAction.count}/${rules.qqqeBelowActions.totalOccurrences} occurrences (${topAction.percentage.toFixed(1)}%)`,
      });
    }
  }

  // Analyze MCO oversold opportunities
  if (rules.mcoOversoldActions.totalOccurrences >= 3) {
    recommendations.push({
      rule: `MCO oversold conditions occur ${rules.mcoOversoldActions.totalOccurrences} times in dataset`,
      confidence: 0.7,
      supporting_data: `Typically followed by: ${rules.mcoOversoldActions.actions
        .slice(0, 2)
        .map((a) => a.action)
        .join(", ")}`,
      suggested_addition: "Consider adding oversold MCO as entry setup confirmation",
    });
  }

  // Analyze green light conditions
  if (rules.greenLightConditions.length > 0) {
    const topPattern = rules.greenLightConditions[0];
    if (topPattern.percentage > 30) {
      recommendations.push({
        rule: `Common "green light" pattern: ${topPattern.pattern}`,
        confidence: topPattern.percentage / 100,
        supporting_data: `Occurred in ${topPattern.count} reports with 3+ pullback candidates`,
      });
    }
  }

  // Analyze red flag conditions
  if (rules.redFlagConditions.length > 0) {
    const topPattern = rules.redFlagConditions[0];
    if (topPattern.percentage > 30) {
      recommendations.push({
        rule: `Common "red flag" pattern: ${topPattern.pattern}`,
        confidence: topPattern.percentage / 100,
        supporting_data: `Occurred in ${topPattern.count} reports with defensive actions`,
        suggested_addition: "Add as risk filter in entry criteria",
      });
    }
  }

  // Pullback frequency insights
  if (rules.pullbackFrequency.avgPullbackCount > 0) {
    recommendations.push({
      rule: `Average pullback candidates: ${rules.pullbackFrequency.avgPullbackCount.toFixed(1)} per day`,
      confidence: 0.9,
      supporting_data: `Universe avg: ${rules.pullbackFrequency.avgUniverseCount.toFixed(1)}, Ratio: ${(rules.pullbackFrequency.pullbackToUniverseRatio * 100).toFixed(1)}%`,
    });
  }

  return recommendations.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generate a formatted report of extracted rules
 */
export function formatRulesReport(rules: ExtractedRules): string {
  const lines: string[] = [];

  lines.push("# Extracted Trading Rules Report");
  lines.push(`\nAnalyzed ${rules.totalReportsAnalyzed} reports from ${rules.dateRange.start} to ${rules.dateRange.end}`);
  lines.push(`Generated: ${rules.extractedAt}`);

  lines.push("\n## Market State Rules\n");

  // QQQE Above
  lines.push("### QQQE Above Cloud");
  lines.push(`Occurrences: ${rules.qqqeAboveActions.totalOccurrences}`);
  for (const action of rules.qqqeAboveActions.actions.slice(0, 5)) {
    lines.push(`- ${action.action}: ${action.count} (${action.percentage.toFixed(1)}%)`);
  }

  // QQQE Below
  lines.push("\n### QQQE Below Cloud");
  lines.push(`Occurrences: ${rules.qqqeBelowActions.totalOccurrences}`);
  for (const action of rules.qqqeBelowActions.actions.slice(0, 5)) {
    lines.push(`- ${action.action}: ${action.count} (${action.percentage.toFixed(1)}%)`);
  }

  // QQQE Inside
  lines.push("\n### QQQE Inside Cloud");
  lines.push(`Occurrences: ${rules.qqqeInsideActions.totalOccurrences}`);
  for (const action of rules.qqqeInsideActions.actions.slice(0, 5)) {
    lines.push(`- ${action.action}: ${action.count} (${action.percentage.toFixed(1)}%)`);
  }

  lines.push("\n## Breadth Rules\n");

  // MCO Oversold
  lines.push("### MCO Oversold");
  lines.push(`Occurrences: ${rules.mcoOversoldActions.totalOccurrences}`);
  for (const action of rules.mcoOversoldActions.actions.slice(0, 3)) {
    lines.push(`- ${action.action}: ${action.count} (${action.percentage.toFixed(1)}%)`);
  }

  lines.push("\n## TLMM Signal Distribution\n");
  for (const signal of rules.tlmmSignalDistribution.slice(0, 5)) {
    lines.push(`- ${signal.pattern}: ${signal.count} (${signal.percentage.toFixed(1)}%)`);
  }

  lines.push("\n## Pullback Frequency\n");
  lines.push(`- Average pullback candidates: ${rules.pullbackFrequency.avgPullbackCount.toFixed(1)}`);
  lines.push(`- Average universe size: ${rules.pullbackFrequency.avgUniverseCount.toFixed(1)}`);
  lines.push(`- Pullback/Universe ratio: ${(rules.pullbackFrequency.pullbackToUniverseRatio * 100).toFixed(1)}%`);

  lines.push("\n## Green Light Conditions (3+ pullbacks)\n");
  for (const condition of rules.greenLightConditions.slice(0, 5)) {
    lines.push(`- ${condition.pattern}: ${condition.count} times (${condition.percentage.toFixed(1)}%)`);
  }

  lines.push("\n## Red Flag Conditions (defensive action)\n");
  for (const condition of rules.redFlagConditions.slice(0, 5)) {
    lines.push(`- ${condition.pattern}: ${condition.count} times (${condition.percentage.toFixed(1)}%)`);
  }

  return lines.join("\n");
}

// =============================================================================
// Exports
// =============================================================================

export default {
  loadAllReports,
  loadReportsInRange,
  extractRulesFromReports,
  generateRuleRecommendations,
  formatRulesReport,
};
