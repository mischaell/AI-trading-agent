# Calculations Reference

**Version:** 1.0
**Last Updated:** 2026-01-25

Quick reference for all key calculations in the trading agent system.

---

## Table of Contents

1. [Position Sizing](#1-position-sizing)
2. [Stop Loss & Risk](#2-stop-loss--risk)
3. [Profit Targets](#3-profit-targets)
4. [Scoring & Ranking](#4-scoring--ranking)
5. [Portfolio Metrics](#5-portfolio-metrics)
6. [Market State](#6-market-state)
7. [Display Formatting](#7-display-formatting)

---

## 1. Position Sizing

### Dynamic Risk-Based Sizing (Default)

```
Target_Risk_% = 0.50% × Grade × Mode × ATR × Limited

Where:
  Grade:   A=1.0, B=0.8, C=0.6
  Mode:    MODE1=0.8, MODE2=1.0
  ATR:     <0.75=0.50, 0.75-1.25=0.75, >1.25=1.0
  Limited: Normal=1.0, LIMITED=0.5

Shares = floor(Target_Risk_$ / R_per_share)
Position_% = (Shares × Entry) / Equity × 100

Clamp to 5-20% bounds
```

**See:** [POSITION-SIZING.md](./POSITION-SIZING.md) for full details

### Legacy Fixed Sizing (Deprecated)

```
MODE1: 10-12% of equity (midpoint 11%)
MODE2: 12-15% of equity (midpoint 13.5%)
```

---

## 2. Stop Loss & Risk

### Structural Stop Loss (SSL)

```
SSL = 21EMA_low (MALow)

Where 21EMA_low = 21-period EMA of daily lows
```

**Exit Rule:** Daily close < SSL → Exit at close (same day)

**Fallback (Price Below 21EMA Low):**
```
If SSL >= Entry (deep pullback):
  SSL = Entry - (1.5 × ATR)
  Or if no ATR: Entry × 0.97
```

### R Per Share (Risk per share)

```
R_per_share = Entry - SSL

Example:
  Entry = $100
  SSL = $95
  R_per_share = $5
```

### ATR Ratio (Volatility check)

```
ATR_ratio = (Entry - SSL) / ATR_14

Interpretation:
  < 0.75  = Dangerous (stop too tight)
  0.75-1.25 = Marginal
  > 1.25  = Healthy (adequate room)
```

### New Exposure Risk (NER)

```
Trade_NER_% = (Shares × R_per_share) / Equity × 100

Example:
  Shares = 100
  R_per_share = $5
  Equity = $100,000
  NER = (100 × $5) / $100,000 × 100 = 0.50%
```

### Portfolio NER

```
Portfolio_NER = Sum of all position NERs (open heat)

Gate: Portfolio_NER after trade < 3.0%
```

---

## 3. Profit Targets

### 2R Trim Price

```
Trim_2R = Entry + (2 × R_per_share)

Example:
  Entry = $100
  R_per_share = $5
  Trim_2R = $100 + (2 × $5) = $110
```

### Trim Amount

```
Trim at 2R: Sell 1/3 of position
Runner: Remaining 2/3 held until SSL break
```

### R-Multiple (Performance)

```
R_Multiple = (Current_Price - Entry) / R_per_share

Example:
  Entry = $100
  Current = $108
  R_per_share = $5
  R_Multiple = ($108 - $100) / $5 = +1.6R
```

---

## 4. Scoring & Ranking

### Focus List Scoring (100 points max)

| Component | Weight | Scoring |
|-----------|--------|---------|
| Ready Grade | 30 pts | A=30, B=20, C=10 |
| Distance to 21EMA | 25 pts | Closer = better (scaled) |
| Entry Mode | 15 pts | MODE2=15, MODE1=10 |
| Contraction | 10 pts | Yes=10, No=0 |
| Close Range | 10 pts | Scaled 0-100% |
| Relative Strength | 10 pts | ≥90=10, ≥80=7, ≥70=4, else=1 |

### Ready Grade Calculation

```
Grade = f(dist_21ema, close_range, contraction, weekly_return)

A = Perfect setup (close to 21EMA, contracting, high range)
B = Good setup (moderate metrics)
C = Acceptable setup (marginal metrics)
```

### Distance to 21EMA (ATR units)

```
Dist_21EMA_ATR = (Price - EMA21_close) / ATR_14

Ideal range: -0.5 to +0.5 ATR
```

---

## 5. Portfolio Metrics

### Gross Exposure

```
Gross_Exposure_% = Sum of all position weights

Example:
  Position A: 12%
  Position B: 10%
  Position C: 8%
  Gross = 30%
```

### Open Heat (Unrealized P&L as % of Equity)

```
Position_Heat = ((Current - Entry) × Shares) / Equity × 100

Portfolio_Heat = Sum of all position heats
```

### Secured Profits

```
Secured_% = Realized_P&L / Equity × 100

Includes: Trimmed profits, closed positions
```

### Position Weight

```
Weight_% = (Shares × Current_Price) / Equity × 100
```

### Total R (Position performance in R units)

```
Total_R = (Current - Entry) / R_per_share

Positive = profit in R-multiples
Negative = loss in R-multiples
```

---

## 6. Market State

### 21EMA Structure (Cloud)

```
MAHigh  = 21EMA(daily highs)
MAClose = 21EMA(daily closes)
MALow   = 21EMA(daily lows)
```

### Structure Position

```
Above cloud: Price > MAHigh
Inside cloud: MALow ≤ Price ≤ MAHigh
Below cloud: Price < MALow
```

### Structure Slope

```
Rising: Current MAClose > Prior MAClose
Flat: Minimal change
Falling: Current MAClose < Prior MAClose
```

### Bar Color Logic

```
Bullish (black): close > MAHigh AND close > MAClose AND close > MALow
Bearish (pink):  high < MALow (or close < all MAs if high condition disabled)
Neutral (gray):  Neither bullish nor bearish
```

### Breadth Metrics (Nasdaq 100)

```
MCO = McClellan Oscillator (advance-decline momentum)
MCSI = McClellan Summation Index (cumulative MCO)

MCO_z = (MCO - Mean) / StdDev
MCSI_z = (MCSI - Mean) / StdDev

MCSI slope: curling_up / curling_down / flat
MCSI vs 10DMA: above / below
```

### Market State Labels

| State | Conditions |
|-------|------------|
| CONFIRMED_UPTREND | MCSI above 10DMA, rising, price above cloud |
| EARLY_CONFIRMATION | MCO washout recovering, MCSI curling up |
| PARTICIPATION_FADE | Breadth diverging from price |
| BREAKDOWN | Price below cloud, falling structure |
| WASHOUT | Extreme negative breadth |

### Market Permissions

| State | New Entries | Adds | Pressing | Trims |
|-------|-------------|------|----------|-------|
| CONFIRMED_UPTREND | YES | YES | YES | YES |
| EARLY_CONFIRMATION | LIMITED | YES | NO | YES |
| PARTICIPATION_FADE | LIMITED | NO | NO | YES |
| BREAKDOWN | NO | NO | NO | YES |
| WASHOUT | NO | NO | NO | NO |

---

## Quick Reference: Key Formulas

```
┌─────────────────────────────────────────────────────────────┐
│ SIZING                                                      │
├─────────────────────────────────────────────────────────────┤
│ R_per_share    = Entry - SSL                                │
│ Shares         = Target_Risk_$ / R_per_share                │
│ Position_%     = (Shares × Entry) / Equity × 100            │
│ NER_%          = (Shares × R_per_share) / Equity × 100      │
├─────────────────────────────────────────────────────────────┤
│ TARGETS                                                     │
├─────────────────────────────────────────────────────────────┤
│ Trim_2R        = Entry + (2 × R_per_share)                  │
│ R_Multiple     = (Current - Entry) / R_per_share            │
├─────────────────────────────────────────────────────────────┤
│ STRUCTURE                                                   │
├─────────────────────────────────────────────────────────────┤
│ SSL            = 21EMA(low)                                 │
│ Dist_21EMA     = (Price - 21EMA_close) / ATR                │
│ ATR_ratio      = (Entry - SSL) / ATR                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Display Formatting

### Compact USD Format

Dollar amounts are rounded to the nearest $1,000 and displayed with "k" suffix for readability:

```
fmtUsdCompact(n):
  if |n| >= 1000:
    return round(n / 1000) + "k"
  else:
    return round(n)

Examples:
  $14,350  → "$14k"
  $7,800   → "$8k"
  $500     → "$500"
  -$3,200  → "-$3k"
```

### Position Display Format

Positions show total value with shares in parentheses:

```
Format: "${compact_value} ({shares})"

Examples:
  $15k (100)    — $15,000 position, 100 shares
  $8k (50)      — $8,000 position, 50 shares
```

### Where Used

| View | Column | Format |
|------|--------|--------|
| Suggested Trades | Total | `$Xk (shares)` |
| Portfolio | Total | `$Xk (shares)` |

---

## Related Documentation

- [POSITION-SIZING.md](./POSITION-SIZING.md) - Full position sizing documentation
- [agent_skeleton_v1.0.md](./agent_skeleton_v1.0.md) - Trading rules
- [agent_tasks.md](./agent_tasks.md) - Task definitions
