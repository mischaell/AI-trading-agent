/**
 * Task 1 — Market Analysis (QQQE + Breadth)
 * Determines market regime and permissions based on QQQE structure and McClellan breadth indicators.
 * @see agent_tasks.md Task 1
 * @see agent_skeleton_v1.0.md Section 1
 */

/** Position of price relative to the 21EMA structure cloud */
export type QqqeStructurePosition = 'above_cloud' | 'inside_cloud' | 'below_cloud';

/** Slope direction of the 21EMA structure */
export type QqqeStructureSlope = 'rising' | 'flat' | 'falling';

/** MCSI momentum direction */
export type McsiSlope = 'curling_up' | 'curling_down';

/** MCSI position relative to its 10-day moving average */
export type McsiVs10dma = 'above' | 'below';

/**
 * Market state labels from Section 1 of agent_skeleton
 * Each state has specific permissions for entries, adds, pressing, and trims.
 */
export type MarketStateLabel =
  | 'EARLY_CONFIRMATION'
  | 'CONFIRMED_UPTREND'
  | 'PARTICIPATION_FADE'
  | 'BREAKDOWN'
  | 'WASHOUT';

/** New entries permission level */
export type NewEntriesPermission = 'YES' | 'LIMITED' | 'NO';

/** Trading permissions derived from market state */
export interface MarketPermissions {
  /** Whether new entries are allowed: YES, LIMITED, or NO */
  new_entries: NewEntriesPermission;
  /** Whether position adds are allowed */
  adds: boolean;
  /** Whether pressing (aggressive sizing) is allowed */
  pressing: boolean;
  /** Whether profit trims are allowed */
  trims: boolean;
}

/**
 * Task 1 output payload
 * Emitted after analyzing QQQE structure and Nasdaq-100 breadth indicators.
 */
export interface MarketStateOutput {
  task: 'market_state';
  /** Market index being analyzed */
  market: 'QQQE';
  /** Breadth universe for MCO/MCSI */
  breadth_universe: 'Nasdaq100';
  /** Price position relative to 21EMA cloud */
  qqqe_structure_position: QqqeStructurePosition;
  /** Slope of the 21EMA structure */
  qqqe_structure_slope: QqqeStructureSlope;
  /** McClellan Oscillator z-score */
  mco_z: number;
  /** McClellan Summation Index z-score */
  mcsi_z: number;
  /** MCSI momentum direction */
  mcsi_slope: McsiSlope;
  /** MCSI vs its 10DMA */
  mcsi_vs_10dma: McsiVs10dma;
  /** Current market state label */
  state: MarketStateLabel;
  /** Derived trading permissions (computed from state) */
  permissions?: MarketPermissions;
}
