# Trading System Architecture

## Overview: Unified Trading Intelligence System

This document describes how newsletter data, Discord execution data, and market data combine to create an adaptive trading recommendation engine with continuous improvement through backtesting.

---

## 1. Data Sources & Their Roles

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCE HIERARCHY                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    LEVEL 1: MARKET CONTEXT                               │  │
│   │                    (What is the market doing?)                           │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   Newsletter (The Prime Report)          Yahoo Finance                   │  │
│   │   ├── Market State (TLMM)                ├── QQQE OHLC                  │  │
│   │   ├── Breadth (MCSI/MCO z-scores)        ├── 21EMA Structure            │  │
│   │   ├── Credit Spreads signal              ├── Real-time quotes           │  │
│   │   ├── BTC signal                         └── Earnings dates             │  │
│   │   └── Market Analysis text                                              │  │
│   │                                                                          │  │
│   │   OUTPUT → Market Regime & Permissions                                  │  │
│   │            { state: CONFIRMED_UPTREND, new_entries: YES, ... }         │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    LEVEL 2: STOCK SELECTION                              │  │
│   │                    (What stocks are actionable?)                         │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   Newsletter                             Yahoo Finance                   │  │
│   │   ├── Liquid Leaders list                ├── RS Calculation             │  │
│   │   ├── Pullback candidates                ├── ADR% / Volatility          │  │
│   │   ├── Top Themes/Sectors (from image)    ├── Volume / Liquidity         │  │
│   │   └── Universe tickers                   └── Distance to 21EMA          │  │
│   │                                                                          │  │
│   │   OUTPUT → Ranked Candidates with Grades                                │  │
│   │            { ticker: NVDA, grade: A, rs: 95, dist_21: 0.2, mode: 2 }   │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    LEVEL 3: TRADE CONSTRUCTION                           │  │
│   │                    (How to size and execute?)                            │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   Agent Pipeline (Tasks 5-7)             Discord Journal                │  │
│   │   ├── Focus List Ranking (score)         ├── Setup reasoning            │  │
│   │   ├── Position Sizing (% of equity)      ├── Mode classification        │  │
│   │   ├── SSL calculation (21EMA Low)        └── Entry triggers             │  │
│   │   ├── Risk Gate (NER limits)                                            │  │
│   │   └── 2R Trim targets                                                   │  │
│   │                                                                          │  │
│   │   OUTPUT → Order Tickets                                                │  │
│   │            { BUY 53 NVDA @ MARKET, SSL: $138, Trim: 17 @ $146 }        │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    LEVEL 4: EXECUTION & FEEDBACK                         │  │
│   │                    (What actually happened?)                             │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   Discord #equity-trades                 Discord #pf-update             │  │
│   │   ├── Actual entry price                 ├── Portfolio sentiment        │  │
│   │   ├── Actual position size               ├── Lessons learned            │  │
│   │   ├── Trim executions                    └── Key decisions              │  │
│   │   ├── Stop outs                                                         │  │
│   │   └── Final P&L                                                         │  │
│   │                                                                          │  │
│   │   OUTPUT → Performance Metrics                                          │  │
│   │            { win_rate: 62%, avg_winner: 2.1R, profit_factor: 2.3 }     │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Unified Data Model

### Core Entities

```typescript
// Daily market context (from newsletter + calculations)
interface DailyContext {
  date: string;

  // Market Regime (determines what's allowed)
  market_state: MarketState;
  permissions: {
    new_entries: boolean;
    adds: boolean;
    pressing: boolean;
    trims: boolean;
  };

  // Breadth (quantified)
  mcsi_zscore: number;
  mco_zscore: number;
  breadth_consensus: string;

  // Risk Environment
  credit_spreads_signal: 'bullish' | 'bearish' | 'neutral';
  btc_signal: 'bullish' | 'bearish' | 'neutral';

  // Source tracking
  from_newsletter: boolean;
  from_calculation: boolean;
}

// Trade recommendation (agent output)
interface TradeRecommendation {
  date: string;
  ticker: string;

  // Selection criteria
  rs_rank: number;
  grade: 'A' | 'B' | 'C';
  mode: 'MODE1' | 'MODE2';
  setup_type: string;

  // Entry details
  entry_price: number;
  position_pct: number;
  position_dollars: number;
  shares: number;

  // Risk management
  ssl: number;
  r_per_share: number;
  ner_pct: number;

  // Exit plan
  trim_shares: number;
  trim_price_2r: number;

  // Context
  market_state: MarketState;
  daily_context_id: string;
}

// Actual trade (from Discord)
interface ActualTrade {
  date: string;
  ticker: string;
  action: 'ENTRY' | 'ADD' | 'TRIM' | 'CLOSE' | 'STOP_OUT';

  // Execution details
  entry_price: number;
  exit_price?: number;
  position_pct: number;
  ssl: number;

  // Result
  gain_pct?: number;
  r_multiple?: number;

  // Matching
  recommendation_id?: string;  // Link to TradeRecommendation
  journal_entry_id?: string;   // Link to reasoning
}

// Performance metrics (calculated)
interface PerformanceMetrics {
  period: { start: string; end: string };

  // Overall
  total_trades: number;
  win_rate: number;
  avg_winner_r: number;
  avg_loser_r: number;
  profit_factor: number;

  // By mode
  mode1: { trades: number; win_rate: number; avg_r: number };
  mode2: { trades: number; win_rate: number; avg_r: number };

  // By market state
  by_market_state: Record<MarketState, {
    trades: number;
    win_rate: number;
  }>;

  // By setup type
  by_setup: Record<string, {
    trades: number;
    win_rate: number;
    avg_r: number;
  }>;
}
```

---

## 3. System Flow: From Data to Recommendation

### Step-by-Step Process

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    DAILY RECOMMENDATION GENERATION FLOW                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   MORNING (Pre-Market)                                                          │
│   ════════════════════════════════════════════════════════════════════════════ │
│                                                                                  │
│   1. NEWSLETTER IMPORT (Automated)                                              │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Gmail API → Parse text → Extract images → Store in daily_reports           │
│   │                                                                              │
│   │ Extracted:                                                                   │
│   │ • Market State: CONFIRMED_UPTREND                                           │
│   │ • Breadth: MCSI +0.45, MCO -0.12                                            │
│   │ • TLMM: PULLBACK since 12/30                                                │
│   │ • Liquid Leaders: [NVDA, META, GOOGL, ...]                                  │
│   │ • Pullback Candidates: [ALAB, NBIS, IREN]                                   │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   2. MARKET CONTEXT BUILDING                                                    │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Combine newsletter data with Yahoo Finance calculations                     │
│   │                                                                              │
│   │ Task 1: Market Analysis                                                      │
│   │ ├── Fetch QQQE OHLC (35 days)                                               │
│   │ ├── Calculate 21EMA structure cloud                                          │
│   │ ├── Determine position (above/below/inside)                                  │
│   │ ├── Determine slope (rising/flat/declining)                                  │
│   │ ├── Merge with newsletter breadth data                                       │
│   │ └── OUTPUT: DailyContext with permissions                                   │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   3. CANDIDATE GENERATION                                                       │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Task 2: Universe Scan                                                        │
│   │ ├── Start with newsletter Liquid Leaders OR Nasdaq 100                      │
│   │ ├── Calculate RS for each (3M + 6M + 12M weighted)                          │
│   │ ├── Filter: RS ≥ 70, not China ADR, not defensive                          │
│   │ └── OUTPUT: 20-40 Liquid Leaders                                            │
│   │                                                                              │
│   │ Task 3: Pullback Scan                                                        │
│   │ ├── For each leader, fetch 21EMA structure                                   │
│   │ ├── Calculate distance to 21EMA (in ATR)                                     │
│   │ ├── Check: dist in [-0.5, 1.0], close > 20%, weekly < 12%                   │
│   │ ├── Detect contraction (ATR shrinking)                                       │
│   │ ├── Assign grade: A (perfect), B (good), C (acceptable)                     │
│   │ └── OUTPUT: 5-10 Pullback Candidates                                        │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   4. ENTRY QUALIFICATION                                                        │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Task 4: Entry Readiness                                                      │
│   │ ├── For each candidate:                                                      │
│   │ │   ├── Check ATR bounds (dist in [-0.5, 1.0])                              │
│   │ │   ├── Check structure intact (close ≥ MALow)                              │
│   │ │   ├── Check earnings (≥ 7 days or unknown)                                │
│   │ │   ├── Determine mode:                                                      │
│   │ │   │   ├── MODE1: Weakness into structure (dist < 0)                       │
│   │ │   │   └── MODE2: Reclaim & backtest (dist ≥ 0, higher low)               │
│   │ │   ├── Determine bar color (bullish/bearish/neutral)                       │
│   │ │   └── Assign setup type and trigger                                        │
│   │ └── OUTPUT: Ready candidates with mode + setup                              │
│   │                                                                              │
│   │ ★ ENHANCEMENT: Cross-reference with newsletter pullback list               │
│   │   If ticker in newsletter pullbacks → boost confidence                      │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   5. RANKING & SELECTION                                                        │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Task 5: Focus List Ranking                                                   │
│   │                                                                              │
│   │ SCORING FORMULA (100 points max):                                           │
│   │ ├── Grade:         A=30, B=20, C=10                                         │
│   │ ├── Distance:      0 ATR=25, ±0.5=15, ±1.0=5                               │
│   │ ├── Mode:          MODE2=15, MODE1=10                                       │
│   │ ├── Contraction:   Yes=10, No=0                                             │
│   │ ├── Close Range:   Scaled 0-10                                              │
│   │ └── RS:            ≥90=10, ≥80=7, ≥70=4                                    │
│   │                                                                              │
│   │ ★ ADAPTIVE WEIGHTS (from performance data):                                 │
│   │   If MODE2 win_rate > MODE1 by 10%+ → increase MODE2 weight                │
│   │   If setup X has > 65% win_rate → boost scores for setup X                 │
│   │                                                                              │
│   │ OUTPUT: Top 5 ranked by score                                               │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   6. POSITION SIZING & RISK GATE                                                │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Task 6: Position Sizing                                                      │
│   │                                                                              │
│   │ For each Top 5 candidate:                                                   │
│   │ ├── SSL = 21EMA Low (MALow from structure)                                  │
│   │ ├── R per share = Entry - SSL                                               │
│   │ ├── Position % by mode:                                                      │
│   │ │   ├── MODE1: 10-12%                                                       │
│   │ │   └── MODE2: 12-15%                                                       │
│   │ ├── Shares = floor(Position $ / Entry price)                                │
│   │ ├── NER % = (R * shares) / equity * 100                                     │
│   │ ├── 2R Trim price = Entry + 2*R                                             │
│   │ ├── Trim shares = floor(shares / 3)                                         │
│   │ │                                                                            │
│   │ RISK GATE:                                                                   │
│   │ ├── ✗ Market forbids entries → WITHHOLD                                     │
│   │ ├── ✗ Earnings < 7 days → WITHHOLD                                          │
│   │ ├── ✗ MODE1 NER > 0.25% → WITHHOLD                                          │
│   │ ├── ✗ MODE2 NER > 0.50% → WITHHOLD                                          │
│   │ └── ✓ All checks pass → PASS                                                │
│   │                                                                              │
│   │ OUTPUT: Sized positions (PASS) or withheld with reason                      │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   7. ORDER TICKET GENERATION                                                    │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Task 7: Execution Plan                                                       │
│   │                                                                              │
│   │ For each PASS trade:                                                        │
│   │ ├── Entry Order: BUY [shares] @ MARKET (DAY)                                │
│   │ ├── Trim Order: SELL [trim_shares] @ [2R price] LIMIT (GTC)                │
│   │ └── Stop Instruction: Daily close < SSL → exit at next day open            │
│   │                                                                              │
│   │ OUTPUT: Ready-to-execute order tickets                                      │
│   └──────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│   DURING DAY (Manual)                                                           │
│   ════════════════════════════════════════════════════════════════════════════ │
│                                                                                  │
│   8. HUMAN EXECUTION                                                            │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Trader reviews recommendations in dashboard                                  │
│   │ Trader executes in broker (or decides to skip)                              │
│   │ Trader posts to Discord #equity-trades:                                     │
│   │   "Long 11% NBIS @ 98.22 (SSL @ 94.03) (EC risk : -0.49%)"                 │
│   └──────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│   EVENING (Automated)                                                           │
│   ════════════════════════════════════════════════════════════════════════════ │
│                                                                                  │
│   9. DISCORD CAPTURE                                                            │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Discord Bot monitors all 3 channels                                         │
│   │ Parses messages → Stores in database                                        │
│   │ Links trades to recommendations (by ticker + date)                          │
│   │ Links journal entries to trades                                             │
│   └──────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│   10. FEEDBACK LOOP                                                             │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Calculate execution quality:                                                │
│   │ ├── Price variance: (actual - suggested) / suggested                        │
│   │ ├── Size variance: (actual_pct - suggested_pct)                             │
│   │ └── Timing score: same day = 100%, next day = 80%                           │
│   │                                                                              │
│   │ Update performance metrics:                                                 │
│   │ ├── Win rate by mode                                                        │
│   │ ├── Win rate by setup type                                                  │
│   │ ├── Win rate by market state                                                │
│   │ └── Profit factor by category                                               │
│   └──────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Backtesting & Model Training

### Data Requirements for Backtesting

```
Historical Data Needed:
────────────────────────────────────────────────────────────────────────────────

1. NEWSLETTER ARCHIVE (Gmail)
   └── 90-365 days of "The Prime Report"
       ├── Market state each day
       ├── Breadth readings
       ├── Liquid Leaders lists
       └── Pullback recommendations

2. DISCORD TRADE HISTORY
   └── All messages from #equity-trades
       ├── Entry trades with prices/sizes
       ├── Add trades
       ├── Trim trades
       ├── Close trades with P&L
       └── Stop outs

3. YAHOO FINANCE (fetched on demand)
   └── Historical OHLC for all tickers
       ├── Calculate RS at each historical date
       ├── Calculate 21EMA structure at each date
       └── Calculate ATR/distance metrics
```

### Backtesting Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BACKTESTING SYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    HISTORICAL DATA LOADER                                │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   For each date in backtest range:                                      │  │
│   │   ├── Load newsletter data for that date (from daily_reports)           │  │
│   │   ├── Fetch Yahoo Finance OHLC as of that date                          │  │
│   │   └── Load actual trades from Discord (from discord_trades)             │  │
│   │                                                                          │  │
│   │   class HistoricalDataLoader {                                          │  │
│   │     async getContextForDate(date: Date): Promise<DailyContext>          │  │
│   │     async getCandlesAsOfDate(ticker: string, date: Date): Promise<Bar[]>│  │
│   │     async getActualTradesForDate(date: Date): Promise<ActualTrade[]>    │  │
│   │   }                                                                      │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    REPLAY ENGINE                                         │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   For each historical date:                                             │  │
│   │   ├── 1. Build DailyContext from newsletter + price data                │  │
│   │   ├── 2. Run Agent Pipeline (Tasks 1-7) with historical data            │  │
│   │   ├── 3. Generate TradeRecommendations                                  │  │
│   │   ├── 4. Compare to ActualTrades (what was actually executed)           │  │
│   │   └── 5. Track outcomes (using future price data)                       │  │
│   │                                                                          │  │
│   │   class ReplayEngine {                                                  │  │
│   │     async replayDate(date: Date, weights: ScoringWeights): {            │  │
│   │       recommendations: TradeRecommendation[];                           │  │
│   │       actual_trades: ActualTrade[];                                     │  │
│   │       outcomes: TradeOutcome[];                                         │  │
│   │     }                                                                    │  │
│   │   }                                                                      │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    OUTCOME CALCULATOR                                    │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   For each recommendation:                                              │  │
│   │   ├── Forward simulate: did it hit 2R? did it stop out?                │  │
│   │   ├── Calculate max favorable excursion (MFE)                           │  │
│   │   ├── Calculate max adverse excursion (MAE)                             │  │
│   │   └── Calculate actual R-multiple achieved                              │  │
│   │                                                                          │  │
│   │   interface TradeOutcome {                                              │  │
│   │     recommendation: TradeRecommendation;                                │  │
│   │     was_executed: boolean;          // Was it in actual trades?         │  │
│   │     entry_date: string;                                                 │  │
│   │     exit_date: string;                                                  │  │
│   │     exit_reason: 'hit_2r' | 'stopped_out' | 'manual_close' | 'open';   │  │
│   │     r_achieved: number;                                                 │  │
│   │     mfe_r: number;                  // Max favorable R                  │  │
│   │     mae_r: number;                  // Max adverse R                    │  │
│   │     holding_days: number;                                               │  │
│   │   }                                                                      │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    PERFORMANCE ANALYZER                                  │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   Aggregate outcomes and calculate:                                     │  │
│   │   ├── Overall win rate                                                  │  │
│   │   ├── Win rate by mode (MODE1 vs MODE2)                                 │  │
│   │   ├── Win rate by market state                                          │  │
│   │   ├── Win rate by setup type                                            │  │
│   │   ├── Win rate by grade (A vs B vs C)                                   │  │
│   │   ├── Average R on winners/losers                                       │  │
│   │   ├── Profit factor                                                     │  │
│   │   ├── Expectancy (avg win * win% - avg loss * loss%)                   │  │
│   │   └── Sharpe ratio (if equity curve available)                          │  │
│   │                                                                          │  │
│   │   Compare:                                                              │  │
│   │   ├── Agent recommendations vs random selection                         │  │
│   │   ├── Agent recommendations vs newsletter-only picks                    │  │
│   │   └── Agent recommendations vs actual trader execution                  │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    WEIGHT OPTIMIZER                                      │  │
│   ├─────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                          │  │
│   │   Goal: Find scoring weights that maximize expectancy                   │  │
│   │                                                                          │  │
│   │   Parameters to optimize:                                               │  │
│   │   ├── grade_weight: 20-40                                               │  │
│   │   ├── distance_weight: 15-30                                            │  │
│   │   ├── mode_weight: 10-20                                                │  │
│   │   ├── contraction_weight: 5-15                                          │  │
│   │   ├── close_range_weight: 5-15                                          │  │
│   │   └── rs_weight: 5-15                                                   │  │
│   │                                                                          │  │
│   │   Methods:                                                              │  │
│   │   ├── Grid search (test all combinations)                               │  │
│   │   ├── Bayesian optimization (smart search)                              │  │
│   │   └── Walk-forward validation (prevent overfitting)                     │  │
│   │                                                                          │  │
│   │   Output: Optimal weights for Focus List scoring                        │  │
│   │                                                                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Walk-Forward Validation (Prevent Overfitting)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    WALK-FORWARD VALIDATION                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Timeline:                                                                     │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Jan    Feb    Mar    Apr    May    Jun    Jul    Aug    Sep    Oct  │       │
│   │                                                                      │       │
│   │ [=====TRAIN=====][TEST]                                             │       │
│   │          [=====TRAIN=====][TEST]                                    │       │
│   │                   [=====TRAIN=====][TEST]                           │       │
│   │                            [=====TRAIN=====][TEST]                  │       │
│   │                                                                      │       │
│   │ Train: 60 days                                                      │       │
│   │ Test:  20 days (out-of-sample)                                      │       │
│   │                                                                      │       │
│   │ For each window:                                                    │       │
│   │ 1. Optimize weights on training period                             │       │
│   │ 2. Apply weights to test period (unseen data)                      │       │
│   │ 3. Record test period performance                                  │       │
│   │                                                                      │       │
│   │ Final weights = average of best weights across all windows         │       │
│   └──────────────────────────────────────────────────────────────────────       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Model Training Approaches

### Approach 1: Rule-Based Optimization (Current)

```
Method: Optimize scoring weights through backtesting

Pros:
• Interpretable (know why each trade was selected)
• No ML infrastructure needed
• Works with limited data (50+ trades)
• Easy to override/adjust

Cons:
• Limited to predefined features
• May miss complex patterns
• Manual feature engineering

Implementation:
• Already built into Focus List Ranking (Task 5)
• Backtest different weight combinations
• Select weights with best out-of-sample performance
```

### Approach 2: Gradient Boosting (XGBoost/LightGBM)

```
Method: Train classifier to predict trade success

Features:
• RS rank (normalized)
• Distance to 21EMA (ATR)
• Grade (one-hot encoded)
• Mode (one-hot encoded)
• Market state (one-hot encoded)
• MCSI z-score
• MCO z-score
• Contraction (boolean)
• Days to earnings
• Sector/Theme (embedded)

Target:
• Binary: win (R > 0) vs loss (R ≤ 0)
• Or regression: predict R-multiple

Pros:
• Can capture non-linear relationships
• Automatic feature importance
• Handles missing data

Cons:
• Needs 200+ trades for reliable training
• Risk of overfitting
• Less interpretable
```

### Approach 3: Fine-Tuned LLM (Claude)

```
Method: Use Claude to score trade setups from context

Input to Claude:
• Newsletter text for the day
• Technical setup description
• Historical performance of similar setups
• Current market state

Prompt:
"Given this market context and technical setup, rate this
trade opportunity from 1-10 and explain why."

Pros:
• Can understand nuanced text signals
• Flexible to new patterns
• No explicit feature engineering

Cons:
• Expensive (API costs)
• Latency for real-time decisions
• Hard to validate/backtest

Best Use:
• Second opinion on marginal trades
• Extracting insights from journal entries
• Generating trade reasoning
```

---

## 6. Continuous Improvement Loop

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CONTINUOUS IMPROVEMENT CYCLE                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Weekly Review (Automated)                                                     │
│   ════════════════════════════════════════════════════════════════════════════ │
│                                                                                  │
│   1. PERFORMANCE CALCULATION                                                    │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Calculate metrics for past week:                                           │
│   │ ├── Win rate overall and by category                                       │
│   │ ├── Average R on winners/losers                                            │
│   │ ├── Compare actual vs recommended trades                                   │
│   │ └── Identify best/worst performing setups                                  │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   2. ANOMALY DETECTION                                                          │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Flag if:                                                                    │
│   │ ├── Win rate drops below 50% for 2+ weeks                                  │
│   │ ├── A setup that was working (>60%) starts failing (<45%)                  │
│   │ ├── Recommended trades are being skipped >50% of time                      │
│   │ └── Execution quality (price variance) degrades                            │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   3. WEIGHT ADJUSTMENT                                                          │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ If MODE2 outperforming MODE1 by 10%+:                                      │
│   │   → Increase mode_weight for MODE2                                         │
│   │                                                                              │
│   │ If setup X has >65% win rate:                                              │
│   │   → Add bonus points for setup X                                            │
│   │                                                                              │
│   │ If grade A trades underperforming B trades:                                │
│   │   → Investigate grading criteria                                            │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   4. INSIGHT GENERATION                                                         │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Use Claude to analyze:                                                      │
│   │ ├── Journal entries for winning vs losing trades                           │
│   │ ├── Market state patterns that worked/failed                               │
│   │ └── Lessons from #pf-update commentary                                     │
│   │                                                                              │
│   │ Generate weekly insights report:                                           │
│   │ "MODE2 reclaim & backtest setups had 72% win rate this week,              │
│   │  vs 48% for MODE1 weakness setups. Consider prioritizing                   │
│   │  reclaim patterns until breadth improves."                                  │
│   └──────────────────────────────────────────────────────────────────────────   │
│                              │                                                  │
│                              ▼                                                  │
│   5. DASHBOARD UPDATE                                                           │
│   ─────────────────────────────────────────────────────────────────────────     │
│   │ Display in UI:                                                              │
│   │ ├── Performance chart (equity curve)                                        │
│   │ ├── Win rate by category (heat map)                                        │
│   │ ├── Current best/worst setups                                              │
│   │ └── Recommendations for next week                                          │
│   └──────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Roadmap

### Phase 1: Data Collection (Current)
- [x] Gmail integration for newsletter import
- [x] Newsletter text parsing
- [x] Newsletter image extraction (Claude Vision)
- [ ] Discord bot for trade capture
- [ ] Discord parsers (equity-trades, alex-journal, pf-update)
- [ ] Trade-to-recommendation matching

### Phase 2: Backtesting Infrastructure
- [ ] Historical data loader (past 90 days)
- [ ] Replay engine (run pipeline on historical data)
- [ ] Outcome calculator (forward simulate trades)
- [ ] Performance analyzer (aggregate metrics)
- [ ] Walk-forward validation framework

### Phase 3: Weight Optimization
- [ ] Grid search for scoring weights
- [ ] Out-of-sample validation
- [ ] A/B testing framework (compare weight sets)
- [ ] Automatic weight updates

### Phase 4: Advanced Analytics
- [ ] Setup-level performance tracking
- [ ] Market state effectiveness analysis
- [ ] Execution quality scoring
- [ ] Insight generation with Claude

### Phase 5: ML Enhancement (Optional)
- [ ] Feature engineering pipeline
- [ ] XGBoost classifier training
- [ ] Model versioning and rollback
- [ ] Hybrid scoring (rules + ML)

---

## 8. Key Metrics to Track

| Metric | Target | Calculation |
|--------|--------|-------------|
| Win Rate | ≥55% | Winning trades / Total trades |
| Avg Winner R | ≥2.0R | Mean R-multiple of winners |
| Avg Loser R | ≤-0.8R | Mean R-multiple of losers |
| Profit Factor | ≥2.0 | Gross profit / Gross loss |
| Expectancy | ≥0.5R | (WinRate × AvgWin) - (LossRate × AvgLoss) |
| Recommendation Accuracy | ≥60% | Recommended trades that would have won |
| Execution Quality | ≥90% | How close actual matches recommended |

---

*Last updated: January 2026*
