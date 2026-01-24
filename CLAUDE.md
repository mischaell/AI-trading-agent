# Claude Code Context

This file provides context for Claude Code when working on this trading agent project.

## Project Overview

This is a trading agent that analyzes market conditions and generates trade recommendations based on Alex's trading methodology. The system runs a 9-task pipeline to analyze markets, identify setups, and generate execution plans.

## Critical Documents to Read

Before making changes to market state, position sizing, or trading logic, **always read these files first**:

1. **`docs/market_state_framework.md`** - Market state determination logic and Alex's trading states
2. **`docs/trading_rules_framework.md`** - Complete trading rules: entries, exits, sizing, scoring
3. **`docs/agent_skeleton_v1.0.md`** - Core trading rules and methodology (frozen v1.0)
4. **`docs/agent_rules.md`** - Invariants and constraints
5. **`docs/agent_tasks.md`** - Pipeline task descriptions

## Key Concepts

### Market State Priority
1. **QQQE Structure** (Primary) - Determines IF we can trade
2. **Breadth (MCO/MCSI)** (Secondary) - Determines HOW aggressive

> QQQE above structure = always tradeable. Breadth only qualifies aggression level.

### Alex's States
- **TESTING**: Small pilots (0.5x size)
- **PRESSING**: Aggressive adds (1.2x size)
- **TRIMMING**: Reducing into strength (0.7x size)
- **DEFENSIVE**: Capital preservation (0.5x size)
- **SELLING**: QQQE below structure (no trades)

### Market States
- **CONFIRMED_UPTREND**: Full permissions (QQQE above + good breadth)
- **EARLY_CONFIRMATION**: Entries OK, no pressing (QQQE above/inside, testing)
- **PARTICIPATION_FADE**: Trim only (QQQE inside + bad breadth)
- **BREAKDOWN**: No trades (QQQE below structure)
- **WASHOUT**: Wait for turn (extreme oversold MCO < -2σ)

## Important Files

### Core Logic
- `src/tasks/market-analysis.ts` - Market state determination
- `src/tasks/position-sizing.ts` - Size calculation with multipliers
- `src/tasks/focus-list-ranking.ts` - Candidate ranking (prioritizes tradeable)
- `src/lib/agent-pipeline.ts` - Main pipeline orchestration

### Data Sources
- `src/lib/backtest/alex-states.ts` - Alex's journal patterns
- `src/lib/backtest/detailed-analysis.ts` - Backtest calculations
- `src/lib/supabase/` - Database interactions

### UI
- `src/views/dashboard.tsx` - Main dashboard components

## Recent Learnings (2024-01-24)

1. **Focus List**: Prioritize tradeable candidates (earnings >= 7 days) over blocked ones
2. **Suggested Trades**: Show PASS candidates first, fill remaining with WITHHOLD
3. **Market State**: QQQE above structure should never return PARTICIPATION_FADE
4. **Reclaim Scenario**: Below cloud + rising slope (higher low) = EARLY_CONFIRMATION

## Testing

```bash
# Run type check
npx tsc --noEmit

# Run dev server
npm run dev

# Run backtest analysis
npx tsx src/lib/backtest/detailed-analysis.ts 2026-01-23
```
