# Market State Framework

## Overview

This document captures the market state determination logic based on Alex's trading journal learnings and backtest analysis. The framework determines trading permissions based on two primary inputs:

1. **QQQE Structure** (Primary) - Determines IF we can trade
2. **Breadth Indicators** (Secondary) - Determines HOW aggressive to be

> **Key Principle**: QQQE structure is the primary signal. Breadth (MCO/MCSI) qualifies the aggressiveness level but should not prevent trading when structure is healthy.

---

## Alex's Behavioral States

From `alex-states.ts`, Alex operates in these behavioral modes:

| State | Description | Size Multiplier |
|-------|-------------|-----------------|
| **TESTING** | Small pilot positions to test market conditions | 0.5x |
| **PRESSING** | Adding aggressively with positive delta/cushion | 1.2x |
| **TRIMMING** | Reducing exposure systematically into strength | 0.7x |
| **DEFENSIVE** | Risk-off mode, capital preservation priority | 0.5x |
| **SELLING** | QQQE below 21DMA structure - go to cash | 0x |
| **NEUTRAL** | Normal market conditions | 1.0x |

---

## QQQE Structure Analysis

### Structure Position

The 21EMA structure creates a "cloud" from three EMAs:
- `maHigh` - 21EMA of highs
- `maClose` - 21EMA of closes
- `maLow` - 21EMA of lows

**Position Determination:**
```
Above Cloud:  close > maHigh AND close > maClose AND close > maLow
Below Cloud:  close < maHigh AND close < maClose AND close < maLow
Inside Cloud: Everything else (within the structure)
```

### Structure Slope

Determined by comparing current vs previous EMA values:
- **Rising**: Structure moving up (bullish)
- **Flat**: Structure stable (neutral)
- **Falling**: Structure moving down (bearish)

---

## Breadth Indicators

### MCO (McClellan Oscillator)
- Measures breadth momentum (oscillator)
- Z-score normalized: -2σ to +2σ range
- **Hook-up**: MCO turning positive = bullish momentum
- **Hook-down**: MCO turning negative = bearish momentum
- **Overbought**: MCO > +1σ = trim into strength
- **Oversold**: MCO < -1σ = potential bounce setup
- **Extreme Oversold**: MCO < -2σ = WASHOUT (potential bottom)

### MCSI (McClellan Summation Index)
- Measures cumulative breadth (trend)
- Z-score normalized
- **Curling Up**: MCSI rising = breadth improving
- **Curling Down**: MCSI falling = breadth deteriorating
- **vs 10DMA**: Above/below 10-day moving average

---

## Market State Determination

### State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                    QQQE ABOVE STRUCTURE                         │
│                    (Always Tradeable)                           │
├─────────────────────────────────────────────────────────────────┤
│ Rising slope OR good breadth → CONFIRMED_UPTREND (PRESSING)     │
│ Otherwise                    → EARLY_CONFIRMATION (TESTING)     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    QQQE INSIDE STRUCTURE                        │
│                    (Cautious - Need Confirmation)               │
├─────────────────────────────────────────────────────────────────┤
│ Rising slope                        → EARLY_CONFIRMATION        │
│ Flat slope + breadth not declining  → EARLY_CONFIRMATION        │
│ Falling slope OR bad breadth        → PARTICIPATION_FADE        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    QQQE BELOW STRUCTURE                         │
│                    (Generally No New Trades)                    │
├─────────────────────────────────────────────────────────────────┤
│ MCO < -2σ (extreme oversold)        → WASHOUT (wait for turn)   │
│ Slope rising (higher low forming)   → EARLY_CONFIRMATION        │
│ Breadth improving (MCSI curling up) → EARLY_CONFIRMATION        │
│ Otherwise                           → BREAKDOWN (no trades)     │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed State Mapping

| QQQE Position | QQQE Slope | Breadth | Market State | Alex State | Permissions |
|---------------|------------|---------|--------------|------------|-------------|
| Above Cloud | Rising | Any | CONFIRMED_UPTREND | PRESSING | Full |
| Above Cloud | Flat | Good | CONFIRMED_UPTREND | PRESSING | Full |
| Above Cloud | Flat | Neutral | EARLY_CONFIRMATION | TESTING | Entries OK |
| Above Cloud | Falling | Good | CONFIRMED_UPTREND | PRESSING | Full |
| Above Cloud | Falling | Weak | EARLY_CONFIRMATION | TESTING | Entries OK |
| Inside Cloud | Rising | Any | EARLY_CONFIRMATION | TESTING | Entries OK |
| Inside Cloud | Flat | Neutral+ | EARLY_CONFIRMATION | TESTING | Entries OK |
| Inside Cloud | Flat/Falling | Bad | PARTICIPATION_FADE | DEFENSIVE | Trim only |
| Below Cloud | Any | MCO < -2σ | WASHOUT | - | Wait |
| Below Cloud | Rising | Any | EARLY_CONFIRMATION | TESTING | Small pilots |
| Below Cloud | Flat/Falling | Improving | EARLY_CONFIRMATION | TESTING | Small pilots |
| Below Cloud | Flat/Falling | Weak | BREAKDOWN | SELLING | No trades |

---

## Trading Permissions by State (Regime Table)

| Market State | New Entries | Adds | Pressing | Trims | Alex Mode |
|--------------|:-----------:|:----:|:--------:|:-----:|-----------|
| **CONFIRMED_UPTREND** | ✅ YES | ✅ YES | ✅ YES | ✅ YES | PRESSING |
| **EARLY_CONFIRMATION** | ⚠️ LIMITED | ✅ YES | ❌ NO | ✅ YES | TESTING |
| **PARTICIPATION_FADE** | ❌ NO | ❌ NO | ❌ NO | ✅ YES | DEFENSIVE |
| **BREAKDOWN** | ❌ NO | ❌ NO | ❌ NO | ✅ YES | SELLING |
| **WASHOUT** | ❌ NO | ❌ NO | ❌ NO | ✅ YES | Wait |

**Legend**:
- ✅ YES = Permitted (full size)
- ⚠️ LIMITED = Permitted (reduced size, testing pilots only)
- ❌ NO = Forbidden

**Regime Gate for New Entries**:
```
CONFIRMED_UPTREND    → PERMIT (full size)
EARLY_CONFIRMATION   → PERMIT (limited size - 0.5x multiplier)
PARTICIPATION_FADE   → FORBID (withhold trade)
BREAKDOWN            → FORBID (withhold trade)
WASHOUT              → FORBID (withhold trade)
```

---

## Position Sizing Multipliers

### State Multipliers
Based on Alex's behavioral state:
```typescript
TESTING:    0.5x  // Small pilots
PRESSING:   1.2x  // Aggressive
TRIMMING:   0.7x  // Reducing
DEFENSIVE:  0.5x  // Risk-off
SELLING:    0x    // No new positions
NEUTRAL:    1.0x  // Normal
```

### Breadth Multipliers
Based on MCO direction:
```typescript
HOOK_UP (MCO change > +3):     1.2x  // Aggressive opportunity
EXPANDING (MCO change > +1):   1.1x  // Favorable
FLAT (MCO change -1 to +1):    1.0x  // Normal
CONTRACTING (MCO change < -1): 0.85x // Cautious
HOOK_DOWN (MCO change < -3):   0.7x  // Defensive
```

### QQQE Multipliers
Based on structure position:
```typescript
Above Cloud:  1.1x  // Full aggression
Inside Cloud: 1.0x  // Normal
Below Cloud:  0.5x  // Reduced (if any)
```

### Combined Multiplier
```
Final Multiplier = State × Breadth × QQQE
Capped between 0.3x and 1.3x
```

---

## Key Patterns from Alex's Journal

### Bullish Signals (PRESSING)
- "MCSI hook-up", "MCSI curling up", "MCSI above 10dma"
- "MCO hook-up", "MCO flipped positive", "MCO from oversold"
- "breadth thrust", "breadth still expanding"
- "delta positive", "cushion allows", "adding to core"

### Bearish Signals (DEFENSIVE)
- "MCSI hook-down", "MCSI below 10dma"
- "MCO hook-down", "MCO showing no life"
- "breadth contracting", "breadth deterioration"
- "cash is a position", "capital preservation"

### Critical Signal (SELLING)
- "QQQE below 21dma-structure" (highest priority - overrides everything)
- "QQQE losing the 21dma-structure"
- "going all cash", "closed all positions"

### Overbought Signals (TRIMMING)
- "MCO in the top", "MCO overbought", "MCO getting stretched"
- "breadth hitting 90%", "short-term stretched"
- "trim into strength", "reducing exposure"

---

## Implementation Notes

### File Locations
- Market state logic: `src/tasks/market-analysis.ts`
- Alex state patterns: `src/lib/backtest/alex-states.ts`
- Position sizing: `src/tasks/position-sizing.ts`
- Pipeline integration: `src/lib/agent-pipeline.ts`

### Critical Functions
```typescript
// Determine market state from QQQE + breadth
determineMarketState(position, slope, mcoZ, mcsiZ, mcsiSlope, mcsiVs10dma)

// Get trading permissions for state
getPermissionsForState(state)

// Calculate position size multipliers
calculateMultipliers(marketState, alexState)
```

### Data Sources
- **QQQE bars**: Yahoo Finance API (35 days for EMA calculation)
- **Breadth data**: Supabase `breadth_indicators` table (calculated from Nasdaq 100)
- **Alex state**: Parsed from Discord journal (optional manual input)

---

## Changelog

- **2024-01-24**: Initial documentation based on alex-states.ts learnings
- Added "below cloud + higher low = EARLY_CONFIRMATION" scenario
- Clarified QQQE structure as primary signal, breadth as qualifier
- Documented position sizing multiplier framework
