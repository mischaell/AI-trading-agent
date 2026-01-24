# Trading Rules Framework

## Overview

This document captures the complete trading rules and framework derived from Alex's methodology, the agent skeleton, and backtest analysis. It covers entry criteria, exit rules, position sizing, and candidate scoring.

---

## 1. Global Invariants (Never Violate)

These rules are absolute and override everything else:

| # | Rule | Description |
|---|------|-------------|
| 1 | **Market-first** | No market confirmation → no portfolio risk |
| 2 | **Long-only** | Never short |
| 3 | **No rotation in downtrends** | Stay focused on liquid growth leaders; no defensive/energy rotation |
| 4 | **Daily timeframe only** | All decisions anchored to daily closes (intraday is execution-only) |
| 5 | **No breakout chasing** | Entries are pullbacks into 21EMA structure or reclaims near structure |
| 6 | **Structure overrides narrative** | Price/structure > news/sentiment/indicators |
| 7 | **EOD discipline** | Stops and readiness evaluated on daily close (exception: max pain) |
| 8 | **Risk defined before entry** | Every trade has SSL and max loss defined pre-trade |
| 9 | **Adds are new trades** | Any add must have its own setup, risk, and stop (no blind scaling) |
| 10 | **Earnings constraint** | No positions initiated if earnings < 7 days away |

---

## 2. Structure Definition

### 2.1 21EMA Structure Cloud

The structure is composed of three EMAs creating a "cloud":

```
MAHigh  = 21EMA(high)   ─┐
MAClose = 21EMA(close)   ├─ Structure Cloud
MALow   = 21EMA(low)    ─┘
```

### 2.2 Structure Position

| Position | Condition | Meaning |
|----------|-----------|---------|
| **Above Cloud** | close > MAHigh AND close > MAClose AND close > MALow | Bullish - price above structure |
| **Inside Cloud** | Within the three EMAs | Neutral - testing structure |
| **Below Cloud** | close < MAHigh AND close < MAClose AND close < MALow | Bearish - price below structure |

### 2.3 Bar Color Logic

- **Bullish (black)**: close > MAHigh AND close > MAClose AND close > MALow
- **Bearish (pink)**: high < MALow (or close below all three)
- **Neutral (gray)**: Everything else

---

## 3. Entry Modes

### Mode 1 — Weakness into Structure
- **Definition**: Buy on weakness INTO the 21EMA structure zone
- **Characteristics**: Best R/R, lower confirmation
- **Distance**: Typically at or below structure (dist_to_21ema <= 0)
- **Position Size**: 10-12% of equity
- **NER (Risk)**: 0.25% per trade

### Mode 2 — Reclaim & Backtest
- **Definition**: Price reclaims the 21DMA-structure, then pulls back for a clean retest forming a structure higher low
- **Characteristics**: Higher confirmation, slightly worse R/R
- **Distance**: Above structure but near (0 <= dist_to_21ema <= 0.5 ATR)
- **Position Size**: 12-15% of equity
- **NER (Risk)**: 0.50% per trade

---

## 4. Entry Grading System

Candidates are graded A/B/C based on setup quality:

### Grade A (Perfect Setup)
All conditions must be met:
- Distance to 21EMA: ≤ 0.3 ATR
- Contraction: Yes (ATR compressing)
- Close in Range: ≥ 60%
- Structure Intact: Yes

### Grade B (Good Setup)
- Distance to 21EMA: ≤ 0.5 ATR
- Close in Range: ≥ 40%
- Structure Intact: Yes
- (Contraction not required)

### Grade C (Acceptable Setup)
- Distance to 21EMA: ≤ 1.0 ATR
- Structure Intact: Yes
- (Other criteria relaxed)

---

## 5. Candidate Scoring (100 Points Max)

Scoring weights for focus list ranking:

| Factor | Weight | Scoring |
|--------|--------|---------|
| **Ready Grade** | 30 pts | A=30, B=20, C=10 |
| **Distance to 21EMA** | 25 pts | 0 ATR=25, ±0.5 ATR=15, ±1.0 ATR=5 |
| **Entry Mode** | 15 pts | MODE2=15, MODE1=10 |
| **Contraction** | 10 pts | Yes=10, No=0 |
| **Close Range** | 10 pts | Scaled 0-100% → 0-10 pts |
| **Relative Strength** | 10 pts | RS 90-99=10, 80-89=7, 70-79=4, <70=1 |

### Contraction Detection
```
Recent ATR (5-day) < Longer ATR (20-day) × 0.8
→ Contraction = True (volatility compressing)
```

### Close Range Calculation
```
Close Range % = (close - low) / (high - low) × 100
→ Higher = more bullish close
```

---

## 6. ATR Bounds for Entry

### Standard Tickers
- Lower bound: -0.5 ATR from 21EMA
- Upper bound: +1.0 ATR from 21EMA

### Discord/Newsletter Tickers (Relaxed)
- Lower bound: -2.0 ATR from 21EMA
- Upper bound: +3.0 ATR from 21EMA

---

## 7. Stop & Exit Rules

### 7.1 Structural Stop Loss (SSL)
- **SSL = MALow (21EMA low band)**
- **Stop trigger**: Daily close below SSL

### 7.2 Exit Timing
- If daily close < SSL → Exit the same day at the close
- Do not wait for next day

### 7.3 Max Pain Override (Hard)
- If max acceptable loss is reached intraday → Exit immediately
- Do not wait for close

---

## 8. Profit-Taking Rules

### 8.1 Trim at 2R
- At **2R profit**, sell **1/3** of the position
- Remaining **2/3** becomes the "runner"

### 8.2 2R Calculation
```
R per share = Entry Price - SSL
2R Price = Entry Price + (2 × R per share)
Trim Shares = Total Shares ÷ 3
```

### 8.3 Runner Management
- Runner held until daily structure breaks
- Exit on daily close below MALow (SSL)
- Exit at close same day

---

## 9. Position Sizing

### 9.1 Base Sizing by Mode

| Mode | Position % | NER (Risk) |
|------|------------|------------|
| MODE1 | 10-12% | 0.25% |
| MODE2 | 12-15% | 0.50% |

### 9.2 Sizing Calculation
```
Position Size ($) = Equity × Position %
Shares = Position Size ($) ÷ Entry Price
Risk per Share = Entry Price - SSL
Total Risk ($) = Shares × Risk per Share
EC Risk % = Total Risk ($) ÷ Equity × 100
```

### 9.3 Size Multipliers

Applied to base position size:

**State Multipliers** (from Alex behavioral state):
| State | Multiplier |
|-------|------------|
| TESTING | 0.5x |
| PRESSING | 1.2x |
| TRIMMING | 0.7x |
| DEFENSIVE | 0.5x |
| SELLING | 0x |
| NEUTRAL | 1.0x |

**Breadth Multipliers** (from MCO direction):
| Direction | MCO Change | Multiplier |
|-----------|------------|------------|
| HOOK_UP | > +3 | 1.2x |
| EXPANDING | > +1 | 1.1x |
| FLAT | -1 to +1 | 1.0x |
| CONTRACTING | < -1 | 0.85x |
| HOOK_DOWN | < -3 | 0.7x |

**QQQE Multipliers** (from structure position):
| Position | Multiplier |
|----------|------------|
| Above Cloud | 1.1x |
| Inside Cloud | 1.0x |
| Below Cloud | 0.5x |

**Combined Multiplier**:
```
Final = State × Breadth × QQQE
Capped: 0.3x to 1.3x
```

---

## 10. Risk Gates (Trade Blockers)

A trade is WITHHELD if any gate fails:

| Gate | Condition | Action |
|------|-----------|--------|
| **Regime Gate** | Market state forbids new entries | WITHHOLD |
| **NER Gate** | Trade NER exceeds allowed limit | WITHHOLD |
| **Earnings Gate** | Earnings < 7 days away | WITHHOLD |
| **Exposure Gate** | Would exceed max gross exposure | WITHHOLD |

### 10.1 Regime Permissions Table

| Market State | New Entries | Adds | Pressing | Trims |
|--------------|:-----------:|:----:|:--------:|:-----:|
| **CONFIRMED_UPTREND** | ✅ YES | ✅ YES | ✅ YES | ✅ YES |
| **EARLY_CONFIRMATION** | ⚠️ LIMITED | ✅ YES | ❌ NO | ✅ YES |
| **PARTICIPATION_FADE** | ❌ NO | ❌ NO | ❌ NO | ✅ YES |
| **BREAKDOWN** | ❌ NO | ❌ NO | ❌ NO | ✅ YES |
| **WASHOUT** | ❌ NO | ❌ NO | ❌ NO | ✅ YES |

**Legend**:
- ✅ YES = Permitted (full size)
- ⚠️ LIMITED = Permitted (reduced size, testing only)
- ❌ NO = Forbidden

**Regime Gate Logic**:
```
if market_state in [PARTICIPATION_FADE, BREAKDOWN, WASHOUT]:
    new_entries = FORBIDDEN → WITHHOLD trade

if market_state == EARLY_CONFIRMATION:
    new_entries = LIMITED → reduce size by 50%

if market_state == CONFIRMED_UPTREND:
    new_entries = PERMITTED → full size allowed
```

### Withhold Reasons
```typescript
'regime_forbids_entries'  // Market state = PARTICIPATION_FADE/BREAKDOWN/WASHOUT
'ner_exceeds_limit'       // Risk too high for mode
'earnings_too_close'      // Earnings within 7 days
'exposure_limit_reached'  // Max exposure exceeded
```

---

## 11. Focus List Rules

### 11.1 Candidate Priority
1. **Tradeable first**: Earnings ≥ 7 days prioritized
2. **Score ranking**: Higher score = higher priority
3. **Top 5**: Only top 5 candidates shown

### 11.2 Manual Promotion
- **One promotion allowed** per day
- **Only reason**: "Best reclaim & backtest quality"
- Must come from same candidate pool
- Promoted to position 5 (replaces #5)

---

## 12. Weekly Return Filter

Prevents chasing extended moves:

| Ticker Type | Max Weekly Return |
|-------------|-------------------|
| Standard | 12% |
| Discord/Newsletter | 25% |

If weekly return exceeds limit → Skip candidate

---

## 13. Execution Format

### Entry Order
```yaml
action: BUY
ticker: QBTS
shares: 416
entry_price: 28.84
order_type: MARKET
tif: DAY
```

### Stop Rule
```yaml
ssl: 26.76
rule: "daily close < ssl → exit at close (same day)"
```

### Profit Target
```yaml
trim_at_2r:
  shares: 139  # 1/3 of position
  price: 33.00
  action: SELL
```

---

## 14. Portfolio Position Status

| Status | R Multiple | Description |
|--------|------------|-------------|
| **STARTER** | < 1R | New position, not yet at 1R profit |
| **CORE** | 1R - 2R | Established position |
| **RUNNER** | ≥ 2R | Winning position, let it run (after trim) |

---

## 15. Key Metrics

### Position Level
- **Weight**: Position value / Equity × 100
- **Open Heat**: Unrealized P&L as % of equity
- **Total R**: Current R multiple
- **EC Risk %**: Capital at risk to SSL

### Portfolio Level
- **Gross Exposure**: Sum of position weights
- **NER**: Sum of EC Risk % across positions
- **Open Heat**: Total unrealized P&L %
- **Secured Profits**: Total realized P&L %

---

## Implementation Files

| Component | File |
|-----------|------|
| Entry grading | `src/lib/backtest/replay-engine.ts` |
| Candidate scoring | `src/tasks/focus-list-ranking.ts` |
| Position sizing | `src/tasks/position-sizing.ts` |
| Risk gates | `src/tasks/position-sizing.ts` |
| Portfolio metrics | `src/tasks/portfolio.ts` |
| Execution plan | `src/tasks/execution-plan.ts` |

---

## Changelog

- **2024-01-24**: Initial documentation from agent_skeleton_v1.0.md and backtest analysis
- Documented entry modes, grading system, scoring weights
- Added position sizing multipliers and risk gates
- Included ATR bounds and weekly return filters
