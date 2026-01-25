# Position Sizing & Risk Management

**Version:** 2.0 (Dynamic Sizing)
**Last Updated:** 2026-01-25

---

## Table of Contents

1. [Philosophy & Goals](#1-philosophy--goals)
2. [Core Formula](#2-core-formula)
3. [Multipliers](#3-multipliers)
4. [ATR Filter](#4-atr-filter)
5. [Position Bounds](#5-position-bounds)
6. [Portfolio NER Gate](#6-portfolio-ner-gate)
7. [Complete Examples](#7-complete-examples)
8. [Trade-offs & Rationale](#8-trade-offs--rationale)
9. [Configuration Reference](#9-configuration-reference)

---

## 1. Philosophy & Goals

### What We're Trying to Achieve

1. **Consistent risk per trade** - Each trade should risk approximately the same dollar amount, regardless of stock price or volatility
2. **Volatility-aware sizing** - Wide stops = smaller positions, tight stops = larger positions
3. **Quality-aware sizing** - Higher quality setups (Grade A) get full size, lower quality (Grade C) get reduced size
4. **Portfolio-level risk control** - Total portfolio risk matters more than per-trade limits
5. **Avoid rejection, prefer adjustment** - Size down risky trades rather than reject them entirely

### Evolution from Legacy Approach

| Aspect | Legacy (v1.0) | Dynamic (v2.0) |
|--------|---------------|----------------|
| Position sizing | Fixed % (11-13.5%) | Risk-based (5-20%) |
| Stop distance | Not considered | Core sizing input |
| ATR/Volatility | Ignored | Penalizes tight stops |
| Per-trade NER gate | Rejects trades | Removed |
| Portfolio NER gate | Not used | Primary risk control |
| Grade impact | None | Multiplier (0.6-1.0) |

---

## 2. Core Formula

### Step-by-Step Calculation

```
INPUTS:
  Equity          = Portfolio value ($)
  Entry           = Entry price ($)
  SSL             = Stop loss price (21EMA low) ($)
  ATR             = 14-day Average True Range ($)
  Grade           = Setup grade (A/B/C)
  Mode            = Entry mode (MODE1/MODE2)

STEP 1: Calculate Stop Distance (R per share)
  R_per_share = Entry - SSL

STEP 2: Calculate ATR Ratio
  ATR_ratio = R_per_share / ATR

STEP 3: Apply Multipliers
  Target_Risk_% = Base_Risk × Grade_Mult × Mode_Mult × ATR_Mult × Limited_Mult
  Target_Risk_$ = Equity × Target_Risk_%

STEP 4: Calculate Shares (risk-based)
  Shares = floor(Target_Risk_$ / R_per_share)

STEP 5: Calculate Position Size
  Position_$ = Shares × Entry
  Position_% = Position_$ / Equity × 100

STEP 6: Apply Bounds (5-20%)
  if Position_% > 20%: Shares = floor(Equity × 20% / Entry)
  if Position_% < 5%:  Shares = floor(Equity × 5% / Entry)

STEP 7: Recalculate Actual Risk
  Actual_NER_% = (Shares × R_per_share) / Equity × 100

OUTPUTS:
  Shares, Position_%, Position_$, Actual_NER_%, was_clamped
```

---

## 3. Multipliers

### Base Risk

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_risk_pct` | 0.50% | Target risk per trade before multipliers |

### Grade Multipliers

Quality of setup affects position size:

| Grade | Multiplier | Meaning |
|-------|------------|---------|
| A | 1.0 | Perfect setup - full size |
| B | 0.8 | Good setup - 80% size |
| C | 0.6 | Acceptable setup - 60% size |

**Rationale:** Higher quality setups have better odds, so we allocate more capital. Lower quality setups still get exposure but with reduced risk.

### Mode Multipliers

Entry mode affects conviction:

| Mode | Multiplier | Meaning |
|------|------------|---------|
| MODE1 | 0.8 | Weakness into structure - less confirmed |
| MODE2 | 1.0 | Reclaim & backtest - higher confirmation |

**Rationale:** MODE2 entries have price confirmation (reclaim), so we're more confident. MODE1 entries are counter-trend, so we size smaller.

### Limited Market Multiplier

When market permissions = LIMITED:

| Condition | Multiplier |
|-----------|------------|
| Normal | 1.0 |
| LIMITED | 0.5 |

**Rationale:** In uncertain market conditions, we test with half-size positions.

### Combined Multiplier Example

```
Grade A + MODE2 + Normal Market:
  1.0 × 1.0 × 1.0 = 1.0 (full size)

Grade B + MODE1 + LIMITED Market:
  0.8 × 0.8 × 0.5 = 0.32 (32% of full size)
```

---

## 4. ATR Filter

### Purpose

The stop (21EMA low) is a **technical level**, not a volatility-based stop. This can create problems:

- If stop is only 0.5 ATR away, normal daily movement can stop you out
- This wastes capital on "noise" stopouts

### ATR Ratio Calculation

```
ATR_ratio = (Entry - SSL) / ATR

Example:
  Entry = $350
  SSL = $345
  ATR = $12

  ATR_ratio = $5 / $12 = 0.42 ATR
```

### ATR Multipliers

| ATR Ratio | Label | Multiplier | Meaning |
|-----------|-------|------------|---------|
| < 0.75 | Dangerous | 0.50 | Stop too tight - high stopout risk |
| 0.75 - 1.25 | Marginal | 0.75 | Borderline - reduce size |
| > 1.25 | Healthy | 1.00 | Adequate breathing room |

### Design Decision: Filter, Not Override

**We do NOT change the stop level.** The 21EMA low is a meaningful technical level that invalidates the trade thesis.

Instead, we **reduce position size** for setups where the stop is dangerously close. This way:
- The trade is still available (not rejected)
- Risk is reduced if we get stopped out on noise
- Technical meaning of the stop is preserved

---

## 5. Position Bounds

### Hard Limits

| Bound | Value | Purpose |
|-------|-------|---------|
| Minimum | 5% | Ensure meaningful position (worth the commission/attention) |
| Maximum | 20% | Prevent over-concentration in single name |

### Clamping Behavior

**Ceiling (20%):** When risk-based sizing suggests > 20%
- Tight stops naturally lead to larger positions
- We cap at 20% to prevent over-concentration
- This means the trade will have **lower NER** than target

**Floor (5%):** When risk-based sizing suggests < 5%
- Wide stops or low-quality setups lead to tiny positions
- We floor at 5% to make it worth taking
- This means the trade will have **higher NER** than target

### Example: Clamping

```
Tight Stop Example (CRWD):
  Risk-based sizing suggests: 35% position
  After clamping: 20% position
  Result: Lower risk than target (0.28% vs 0.50%)

Wide Stop Example (SMCI):
  Risk-based sizing suggests: 3% position
  After clamping: 5% position
  Result: Higher risk than target (0.55% vs 0.32%)
```

---

## 6. Portfolio NER Gate

### Philosophy Shift

**Legacy:** Per-trade NER limits (MODE1: 0.25%, MODE2: 0.50%)
- Problem: Rejected trades instead of sizing them appropriately

**Dynamic:** Portfolio-level NER limit only
- Position sizing already adjusts for risk
- We only gate when **total portfolio risk** is too high

### Portfolio NER Calculation

```
Portfolio_NER = Current_Open_Heat + New_Trade_NER

Example:
  Current positions NER: 1.5%
  New trade NER: 0.50%
  Total after trade: 2.0%

  Max allowed: 3.0%
  Gate: PASS (2.0% < 3.0%)
```

### When Trades Are Withheld

Only when adding this trade would push total portfolio risk above limit:

| Reason | Condition |
|--------|-----------|
| `portfolio_ner_exceeded` | Portfolio NER after trade > 3.0% |
| `regime_forbids_entries` | Market state = NO new entries |
| `earnings_too_close` | Earnings < 7 days |
| `exposure_limit_reached` | Gross exposure > 150% |

---

## 7. Complete Examples

### Example 1: CRWD (Tight Stop, Grade A)

```
INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Equity:         $100,000
Entry:          $350.00
SSL:            $345.00 (21EMA low)
ATR:            $12.00
Grade:          A
Mode:           MODE2
Market:         Normal

STEP 1: Stop Distance
  R_per_share = $350 - $345 = $5.00

STEP 2: ATR Ratio
  ATR_ratio = $5 / $12 = 0.42
  Label: DANGEROUS (< 0.75)

STEP 3: Multipliers
  Base Risk:      0.50%
  Grade (A):      × 1.0
  Mode (MODE2):   × 1.0
  ATR (0.42):     × 0.50 (dangerous)

  Target Risk:    0.50% × 1.0 × 1.0 × 0.50 = 0.25%
  Target Risk $:  $100,000 × 0.25% = $250

STEP 4: Shares (risk-based)
  Shares = floor($250 / $5) = 50 shares

STEP 5: Position Size
  Position $ = 50 × $350 = $17,500
  Position % = 17.5%

STEP 6: Bounds Check
  17.5% is within 5-20% → NO CLAMPING

STEP 7: Actual Risk
  NER = (50 × $5) / $100,000 = 0.25%

RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shares:         50
Position:       $17,500 (17.5%)
NER:            0.25%
2R Target:      $350 + (2 × $5) = $360.00

NOTE: ATR filter reduced size by 50% due to dangerous
stop distance (0.42 ATR). Without filter, would be 100
shares at 35% position (clamped to 20%).
```

### Example 2: META (Moderate Stop, Grade A)

```
INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Equity:         $100,000
Entry:          $500.00
SSL:            $485.00 (21EMA low)
ATR:            $10.00
Grade:          A
Mode:           MODE2
Market:         Normal

STEP 1: Stop Distance
  R_per_share = $500 - $485 = $15.00

STEP 2: ATR Ratio
  ATR_ratio = $15 / $10 = 1.50
  Label: HEALTHY (> 1.25)

STEP 3: Multipliers
  Base Risk:      0.50%
  Grade (A):      × 1.0
  Mode (MODE2):   × 1.0
  ATR (1.50):     × 1.0 (healthy)

  Target Risk:    0.50% × 1.0 × 1.0 × 1.0 = 0.50%
  Target Risk $:  $100,000 × 0.50% = $500

STEP 4: Shares (risk-based)
  Shares = floor($500 / $15) = 33 shares

STEP 5: Position Size
  Position $ = 33 × $500 = $16,500
  Position % = 16.5%

STEP 6: Bounds Check
  16.5% is within 5-20% → NO CLAMPING

STEP 7: Actual Risk
  NER = (33 × $15) / $100,000 = 0.495%

RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shares:         33
Position:       $16,500 (16.5%)
NER:            0.495%
2R Target:      $500 + (2 × $15) = $530.00

NOTE: Perfect fit. Healthy ATR ratio, no clamping needed,
hits target risk almost exactly.
```

### Example 3: SMCI (Wide Stop, Grade B, MODE1)

```
INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Equity:         $100,000
Entry:          $45.00
SSL:            $40.00 (21EMA low)
ATR:            $4.50
Grade:          B
Mode:           MODE1
Market:         Normal

STEP 1: Stop Distance
  R_per_share = $45 - $40 = $5.00

STEP 2: ATR Ratio
  ATR_ratio = $5 / $4.50 = 1.11
  Label: MARGINAL (0.75-1.25)

STEP 3: Multipliers
  Base Risk:      0.50%
  Grade (B):      × 0.8
  Mode (MODE1):   × 0.8
  ATR (1.11):     × 0.75 (marginal)

  Target Risk:    0.50% × 0.8 × 0.8 × 0.75 = 0.24%
  Target Risk $:  $100,000 × 0.24% = $240

STEP 4: Shares (risk-based)
  Shares = floor($240 / $5) = 48 shares

STEP 5: Position Size
  Position $ = 48 × $45 = $2,160
  Position % = 2.16%

STEP 6: Bounds Check
  2.16% < 5% floor → CLAMP UP TO 5%

  Min Position $ = $100,000 × 5% = $5,000
  Adjusted Shares = floor($5,000 / $45) = 111 shares
  Adjusted Position = 111 × $45 = $4,995 (5.0%)

STEP 7: Actual Risk
  NER = (111 × $5) / $100,000 = 0.555%

RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shares:         111
Position:       $4,995 (5.0%)
NER:            0.555%
2R Target:      $45 + (2 × $5) = $55.00
Was Clamped:    FLOOR

NOTE: Multiple factors reduced target risk:
- Grade B (0.8)
- MODE1 (0.8)
- Marginal ATR (0.75)
Position was floored to 5% minimum, resulting in higher
than target NER (0.555% vs 0.24% target).
```

---

## 8. Trade-offs & Rationale

### Why Risk-Based Instead of Fixed %?

| Fixed % | Risk-Based |
|---------|------------|
| Same position size regardless of stop | Position size adapts to stop distance |
| Wide stops = huge risk | Wide stops = small position |
| Tight stops = tiny risk | Tight stops = large position (capped) |
| Simple but disconnected from risk | Complex but risk-consistent |

**Trade-off:** More complexity for better risk control.

### Why ATR Filter Instead of ATR-Based Stops?

| ATR-Based Stop | ATR Filter |
|----------------|------------|
| Stop at Entry - 1.5×ATR | Stop at 21EMA low (technical) |
| Arbitrary price level | Meaningful technical level |
| Trade thesis unclear | Trade thesis clear |
| — | Sizes down for tight stops |

**Trade-off:** We keep meaningful technical stops but reduce size when they're dangerously close. Best of both worlds.

### Why Portfolio NER Gate Instead of Per-Trade?

| Per-Trade NER | Portfolio NER |
|---------------|---------------|
| Rejects trades | Allows trades (sizing adjusts) |
| Ignores portfolio context | Considers total risk |
| Binary (pass/fail) | Graduated (multipliers) |

**Trade-off:** More trades get executed, but we still have portfolio-level protection.

### Why 5-20% Bounds?

| Bound | Purpose | Trade-off |
|-------|---------|-----------|
| 5% floor | Ensure meaningful position | May take more risk than target |
| 20% ceiling | Prevent over-concentration | May take less risk than target |

**Trade-off:** Positions are always meaningful but bounded, at the cost of sometimes deviating from target risk.

---

## 9. Configuration Reference

### Default Configuration

```typescript
{
  // Dynamic sizing (enabled by default)
  use_dynamic_sizing: true,
  base_risk_pct: 0.50,
  min_position_pct: 5,
  max_position_pct: 20,
  portfolio_max_ner_pct: 3.0,

  // Grade multipliers
  grade_a_multiplier: 1.0,
  grade_b_multiplier: 0.8,
  grade_c_multiplier: 0.6,

  // Mode multipliers
  mode1_multiplier: 0.8,
  mode2_multiplier: 1.0,

  // ATR filter thresholds
  atr_dangerous_threshold: 0.75,
  atr_marginal_threshold: 1.25,
  atr_dangerous_multiplier: 0.50,
  atr_marginal_multiplier: 0.75,

  // Other gates
  min_earnings_days: 7,
  reduce_size_for_limited: true,
  limited_size_factor: 0.5,
}
```

### Tuning Guidelines

| Parameter | Increase If... | Decrease If... |
|-----------|----------------|----------------|
| `base_risk_pct` | Portfolio consistently underinvested | Too many large drawdowns |
| `min_position_pct` | Too many tiny positions | Want more flexibility on weak setups |
| `max_position_pct` | High conviction trades underweighted | Single positions causing pain |
| `portfolio_max_ner_pct` | Missing opportunities | Portfolio drawdowns too large |
| `atr_dangerous_threshold` | Too many early stopouts | Missing tight setups |

---

## Appendix: Output Fields

The sizing output includes these dynamic sizing fields:

```typescript
interface SizingOutput {
  // ... standard fields ...

  // Dynamic sizing fields
  atr?: number;              // ATR value used
  atr_ratio?: number;        // Stop distance / ATR
  atr_multiplier?: number;   // 0.5, 0.75, or 1.0
  was_clamped?: 'floor' | 'ceiling' | null;
  target_risk_pct?: number;  // Before clamping
}
```

---

## Related Documentation

- [agent_skeleton_v1.0.md](./agent_skeleton_v1.0.md) - Original trading rules
- [agent_tasks.md](./agent_tasks.md) - Task-by-task flow
- [SYSTEM-ARCHITECTURE.md](./SYSTEM-ARCHITECTURE.md) - System overview
