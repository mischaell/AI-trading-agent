/**
 * Trading Agent Type Definitions
 * Re-exports all types from individual task files.
 * @see agent_tasks.md for YAML output specifications
 */

// Task 1 — Market Analysis
export type {
  QqqeStructurePosition,
  QqqeStructureSlope,
  McsiSlope,
  McsiVs10dma,
  MarketStateLabel,
  NewEntriesPermission,
  MarketPermissions,
  MarketStateOutput,
  BreadthDirection,  // NEW
} from './market-state';

// Task 2 — Universe Scan
export type {
  RefreshFrequency,
  UniverseLeader,
  UniverseScanOutput,
} from './universe';

// Task 3 — Pullback Scan
export type {
  PullbackScanRules,
  ReadinessGrade,
  PullbackCandidate,
  PullbackScanOutput,
} from './pullback';

// Task 4 — Entry Readiness
export type {
  EntryMode,
  ReadinessRow,
  ReadinessOutput,
} from './readiness';

// Task 5 — Focus List
export type {
  ManualPromotionReason,
  ManualPromotion,
  ReclaimBacktestGrade,
  FocusListCandidate,
  FocusListOutput,
} from './focus-list';

// Task 6 — Position Sizing
export type {
  GateResult,
  WithholdReason,
  SizingOutput,
  SizingBatchOutput,
  SizingMultipliers,    // NEW
  SizingActionType,     // NEW
} from './sizing';

// Task 7 — Execution Plan
export type {
  OrderType,
  TimeInForce,
  EntryOrder,
  Trim2ROrder,
  ProfitInstructions,
  StopInstructions,
  ExecutionPlanOutput,
  ExecutionPlanBatchOutput,
} from './execution';

// Task 8 — Portfolio
export type {
  PositionStatus,
  TradeSide,
  PortfolioSummary,
  PortfolioPosition,
  PortfolioOutput,
  TrimRecommendation,
} from './portfolio';

// Task 9 — Trades Today / Overview
export type {
  TradeAction,
  TradeActionType,
  NavItem,
  TradeRecord,
  OverviewOutput,
  TradeStats,
} from './trades';

// Gmail Import — Daily Reports
export type {
  DailyReport,
  DailyReportInsert,
  DailyReportSummary,
  GmailToken,
  GmailTokenInsert,
} from './daily-report';
