# Trading Agent Data Flow

Complete data flow architecture for the Trading Agent system.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TRADING AGENT SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                   │
│   │   INPUTS     │     │  PROCESSING  │     │   OUTPUTS    │                   │
│   ├──────────────┤     ├──────────────┤     ├──────────────┤                   │
│   │ Gmail        │────▶│ Agent        │────▶│ Dashboard    │                   │
│   │ Discord      │     │ Pipeline     │     │ Order Tickets│                   │
│   │ Yahoo Finance│     │ (Tasks 1-9)  │     │ Performance  │                   │
│   │ Supabase     │     │              │     │ Analytics    │                   │
│   └──────────────┘     └──────────────┘     └──────────────┘                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

### 1. Gmail Integration (Newsletter Import)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        GMAIL → DAILY REPORTS FLOW                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────┐     ┌─────────────────────────────────────────────────────┐  │
│   │   Gmail     │     │            Newsletter Parser                         │  │
│   │   Inbox     │     ├─────────────────────────────────────────────────────┤  │
│   │             │     │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│   │ "The Prime  │────▶│  │ Text Parser │  │ Image       │  │ Rules       │ │  │
│   │  Report"    │     │  │             │  │ Analyzer    │  │ Extractor   │ │  │
│   │             │     │  │ • Market    │  │ (Claude     │  │             │ │  │
│   │ • Text Body │     │  │   Analysis  │  │  Vision)    │  │ • Trading   │ │  │
│   │ • HTML Body │     │  │ • Breadth   │  │             │  │   Rules     │ │  │
│   │ • Images    │     │  │ • TLMM      │  │ • McClellan │  │ • Position  │ │  │
│   │             │     │  │ • Tickers   │  │   Tables    │  │   Sizing    │ │  │
│   └─────────────┘     │  │             │  │ • Sectors   │  │ • Entry     │ │  │
│                       │  └──────┬──────┘  │ • Charts    │  │   Criteria  │ │  │
│                       │         │         └──────┬──────┘  └─────────────┘ │  │
│                       │         │                │                          │  │
│                       │         └────────┬───────┘                          │  │
│                       │                  ▼                                  │  │
│                       │         ┌─────────────────┐                         │  │
│                       │         │  daily_reports  │                         │  │
│                       │         │    (Supabase)   │                         │  │
│                       │         └─────────────────┘                         │  │
│                       └─────────────────────────────────────────────────────┘  │
│                                                                                  │
│   Files:                                                                        │
│   • src/lib/gmail/client.ts          - OAuth2 + email fetching                 │
│   • src/lib/gmail/report-parser.ts   - Text section extraction                 │
│   • src/lib/gmail/image-analyzer.ts  - Claude Vision API                       │
│   • src/lib/gmail/rules-extractor.ts - Trading rules extraction                │
│                                                                                  │
│   Data Labels:                                                                  │
│   • "From Text"  - Parsed from newsletter text                                 │
│   • "From Image" - Extracted via Claude Vision                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Discord Integration (Trade Execution Tracking)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        DISCORD → TRADE TRACKING FLOW                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Discord Server                                                                │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                                                                          │  │
│   │  #equity-trades          #alex-journal          #pf-update              │  │
│   │  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐         │  │
│   │  │ Trade       │        │ Trade       │        │ Portfolio   │         │  │
│   │  │ Executions  │        │ Reasoning   │        │ Commentary  │         │  │
│   │  │             │        │             │        │             │         │  │
│   │  │ • ENTRY     │        │ • Setup     │        │ • Market    │         │  │
│   │  │ • ADD       │        │   Type      │        │   View      │         │  │
│   │  │ • TRIM      │        │ • Mode      │        │ • Lessons   │         │  │
│   │  │ • CLOSE     │        │   (1 or 2)  │        │ • Sentiment │         │  │
│   │  │ • STOP_OUT  │        │ • Charts    │        │             │         │  │
│   │  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘         │  │
│   │         │                      │                      │                 │  │
│   └─────────┼──────────────────────┼──────────────────────┼─────────────────┘  │
│             │                      │                      │                    │
│             ▼                      ▼                      ▼                    │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐           │
│   │ equity-trades   │    │ alex-journal    │    │ pf-update       │           │
│   │ Parser          │    │ Parser          │    │ Parser          │           │
│   │                 │    │                 │    │                 │           │
│   │ Regex patterns: │    │ Extracts:       │    │ Uses Claude to: │           │
│   │ • ENTRY_PATTERN │    │ • ticker        │    │ • Summarize     │           │
│   │ • ADD_PATTERN   │    │ • setup_type    │    │ • Extract points│           │
│   │ • TRIM_PATTERN  │    │ • mode          │    │ • Detect tickers│           │
│   │ • CLOSE_PATTERN │    │ • reasoning     │    │ • Infer sentiment│          │
│   │ • STOP_PATTERN  │    │                 │    │                 │           │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘           │
│            │                      │                      │                    │
│            ▼                      ▼                      ▼                    │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│   │ discord_trades  │◀──▶│ discord_journal │    │ discord_portfolio_updates│  │
│   │   (Supabase)    │    │   (Supabase)    │    │       (Supabase)         │  │
│   └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
│            │                                                                   │
│            ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐ │
│   │                      Trade Matcher                                       │ │
│   │                                                                          │ │
│   │  1. Link journal entries to trades (same ticker, same day)              │ │
│   │  2. Match Discord trades to Suggested Trades from agent                 │ │
│   │  3. Calculate execution quality (price variance, timing)                │ │
│   │                                                                          │ │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│            │                                                                   │
│            ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐ │
│   │                    Performance Analytics                                 │ │
│   │                                                                          │ │
│   │  • Win rate (overall, by mode, by market state)                         │ │
│   │  • Average R on winners/losers                                          │ │
│   │  • Profit factor                                                         │ │
│   │  • Position management (2R trim hit rate, stop out rate)                │ │
│   │  • Holding period analysis                                               │ │
│   │                                                                          │ │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│   Files:                                                                        │
│   • src/lib/discord/client.ts                   - Discord.js bot               │
│   • src/lib/discord/parsers/equity-trades.ts    - Trade message parsing        │
│   • src/lib/discord/parsers/alex-journal.ts     - Journal entry parsing        │
│   • src/lib/discord/parsers/pf-update.ts        - Portfolio update parsing     │
│   • src/lib/discord/trade-matcher.ts            - Link trades to suggestions   │
│   • src/lib/discord/performance.ts              - Calculate performance stats  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Yahoo Finance (Market Data)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        YAHOO FINANCE → MARKET DATA FLOW                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Yahoo Finance API                      Trading Agent Pipeline                 │
│   ┌─────────────────┐                   ┌─────────────────────────────────────┐│
│   │                 │                   │                                      ││
│   │ • OHLC Data     │──────────────────▶│ Task 1: Market Analysis             ││
│   │   (QQQE daily)  │                   │   • 21EMA Structure Cloud           ││
│   │                 │                   │   • Position (above/below/inside)   ││
│   │ • Quote Data    │                   │   • Slope (rising/flat/declining)   ││
│   │   (104 tickers) │──────────────────▶│                                      ││
│   │                 │                   │ Task 2: Universe Scan               ││
│   │ • Earnings Data │                   │   • RS Calculation                  ││
│   │   (next date)   │──────────────────▶│   • ADR% / Liquidity               ││
│   │                 │                   │   • Distance to 21EMA               ││
│   └─────────────────┘                   │                                      ││
│                                         │ Task 3: Pullback Scan               ││
│                                         │   • Structure analysis              ││
│                                         │   • Contraction detection           ││
│                                         │                                      ││
│                                         │ Task 4: Entry Readiness             ││
│                                         │   • Earnings check (7+ days)        ││
│                                         │   • ATR bounds check                ││
│                                         │   • Mode assignment (1 or 2)        ││
│                                         └─────────────────────────────────────┘│
│                                                                                  │
│   Files:                                                                        │
│   • src/lib/market-data/client.ts          - Yahoo Finance wrapper             │
│   • src/lib/market-data/calculations.ts    - EMA, ATR, RS calculations        │
│   • src/lib/market-data/relative-strength.ts - RS ranking logic               │
│   • src/lib/market-data/universe.ts        - Universe filtering                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Pipeline (Tasks 1-9)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AGENT PIPELINE FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Input: $100,000 Equity                                                         │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 1: MARKET ANALYSIS                                                     ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  QQQE OHLC, Breadth (MCSI/MCO)                                      ││
│  │ Output: Market State, Permissions                                          ││
│  │                                                                             ││
│  │ State: CONFIRMED_UPTREND                                                   ││
│  │ Permissions: { new_entries: YES, adds: true, pressing: true, trims: true }  ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 2: UNIVERSE SCAN                                                       ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Nasdaq 100 tickers                                                 ││
│  │ Output: Liquid Leaders (RS ≥ 70)                                           ││
│  │                                                                             ││
│  │ 104 tickers → 30 liquid leaders                                            ││
│  │ Filters: Ex-China, Ex-Defensives, Liquidity > $5M/day                      ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 3: PULLBACK SCAN                                                       ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Liquid Leaders                                                     ││
│  │ Output: Pullback Candidates                                                ││
│  │                                                                             ││
│  │ 30 leaders → 4 pullback candidates                                         ││
│  │ Rules: dist_21 in [-0.5, 1.0], close > 20%, contraction, weekly < 12%     ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 4: ENTRY READINESS                                                     ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Pullback Candidates                                                ││
│  │ Output: Ready/Not Ready + Mode                                             ││
│  │                                                                             ││
│  │ 4 pullbacks → 4 READY                                                      ││
│  │ Checks: ATR bounds, structure intact, earnings > 7 days                    ││
│  │ Mode: MODE1 (weakness) or MODE2 (reclaim)                                  ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 5: FOCUS LIST RANKING                                                  ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Ready Candidates                                                   ││
│  │ Output: Top 5 ranked by score                                              ││
│  │                                                                             ││
│  │ Scoring: Grade (30) + Distance (25) + Mode (15) + Contract (10) +         ││
│  │          Close (10) + RS (10) = 100 max                                    ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 6: POSITION SIZING & RISK GATE                                         ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Top 5 + Market State                                               ││
│  │ Output: Sized positions or WITHHOLD                                        ││
│  │                                                                             ││
│  │ MODE1: 10-12% position, max NER 0.25%                                      ││
│  │ MODE2: 12-15% position, max NER 0.50%                                      ││
│  │ Gate: Market regime, earnings, NER limits                                  ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 7: EXECUTION PLAN                                                      ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Sized positions                                                    ││
│  │ Output: Order tickets + Stop instructions                                  ││
│  │                                                                             ││
│  │ Entry: BUY [shares] @ MARKET (DAY)                                         ││
│  │ Trim:  SELL [1/3 shares] @ [2R price] LIMIT (GTC)                         ││
│  │ Stop:  Daily close < [SSL] → exit at close                                ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 8: PORTFOLIO MANAGEMENT                                                ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  Current positions + new orders                                     ││
│  │ Output: Updated portfolio state                                            ││
│  │                                                                             ││
│  │ Tracks: Entry, SSL, 2R trim, status (STARTER/CORE/RUNNER)                 ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                              │                                                  │
│                              ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │ Task 9: OVERVIEW & AUDIT                                                    ││
│  │ ────────────────────────────────────────────────────────────────────────── ││
│  │ Input:  All task outputs                                                   ││
│  │ Output: Trades today, audit log                                            ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  Files:                                                                         │
│  • src/lib/agent-pipeline.ts    - Pipeline orchestration                       │
│  • src/tasks/market-analysis.ts - Task 1                                       │
│  • src/tasks/universe-scan.ts   - Task 2                                       │
│  • src/tasks/pullback-scan.ts   - Task 3                                       │
│  • src/tasks/entry-readiness.ts - Task 4                                       │
│  • src/tasks/focus-list-ranking.ts - Task 5                                    │
│  • src/tasks/position-sizing.ts - Task 6                                       │
│  • src/tasks/execution-plan.ts  - Task 7                                       │
│  • src/tasks/portfolio.ts       - Task 8                                       │
│  • src/tasks/overview.ts        - Task 9                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Closed Loop: Suggestion → Execution → Performance

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CLOSED LOOP FEEDBACK SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      1. NEWSLETTER INPUT                                  │  │
│  │                         (The Prime Report)                                │  │
│  │                                                                           │  │
│  │   Gmail → Parser → daily_reports                                         │  │
│  │                         │                                                 │  │
│  │   • Market Analysis     │                                                 │  │
│  │   • Breadth Data        │                                                 │  │
│  │   • Liquid Leaders      ▼                                                 │  │
│  │   • Pullback Scan   ┌───────────────┐                                    │  │
│  │                     │ Agent Context │                                    │  │
│  └─────────────────────┴───────────────┴────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      2. AGENT PROCESSING                                  │  │
│  │                         (Tasks 1-7)                                       │  │
│  │                                                                           │  │
│  │   Universe → Pullbacks → Ready → Ranked → Sized → Execution Plan         │  │
│  │                                                                           │  │
│  │   Output: SUGGESTED TRADES                                               │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │   │ #1 EA (MODE1)  BUY 53 @ MARKET, SSL: $203.93, 2R: $204.89         │ │  │
│  │   │ #2 AZN (MODE2) BUY 143 @ MARKET, SSL: $92.37, 2R: $98.43          │ │  │
│  │   │ ...                                                                │ │  │
│  │   └────────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      3. MANUAL EXECUTION                                  │  │
│  │                         (Human Trader)                                    │  │
│  │                                                                           │  │
│  │   Trader reviews suggested trades, executes in broker                    │  │
│  │   Posts execution to Discord #equity-trades                              │  │
│  │                                                                           │  │
│  │   "Long 11% NBIS @ 98.22 (SSL @ 94.03) (EC risk : -0.49%)"              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      4. DISCORD CAPTURE                                   │  │
│  │                         (Bot Monitoring)                                  │  │
│  │                                                                           │  │
│  │   Discord Bot listens to:                                                │  │
│  │   • #equity-trades → discord_trades                                      │  │
│  │   • #alex-journal  → discord_journal                                     │  │
│  │   • #pf-update     → discord_portfolio_updates                           │  │
│  │                                                                           │  │
│  │   Parses messages → Stores in Supabase → Confirms with ✅ reaction       │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      5. TRADE MATCHING                                    │  │
│  │                                                                           │  │
│  │   ┌─────────────────────┐     ┌─────────────────────┐                   │  │
│  │   │   Suggested Trade   │     │   Actual Trade      │                   │  │
│  │   │   (from Agent)      │────▶│   (from Discord)    │                   │  │
│  │   │                     │     │                     │                   │  │
│  │   │ • Ticker: NBIS      │     │ • Ticker: NBIS      │  ✓ Match          │  │
│  │   │ • Entry: $98.50     │     │ • Entry: $98.22     │  Δ -0.28%         │  │
│  │   │ • Size: 12%         │     │ • Size: 11%         │  Δ -1%            │  │
│  │   │ • SSL: $94.00       │     │ • SSL: $94.03       │  ✓ Close          │  │
│  │   └─────────────────────┘     └─────────────────────┘                   │  │
│  │                                                                           │  │
│  │   Execution Quality Score: 95%                                           │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      6. PERFORMANCE ANALYTICS                             │  │
│  │                                                                           │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │   │                     Performance Metrics                            │ │  │
│  │   ├────────────────────────────────────────────────────────────────────┤ │  │
│  │   │ Win Rate:        58.3%                                             │ │  │
│  │   │ Avg Winner:      +2.1R                                             │ │  │
│  │   │ Avg Loser:       -0.8R                                             │ │  │
│  │   │ Profit Factor:   2.35                                              │ │  │
│  │   │                                                                    │ │  │
│  │   │ By Mode:                                                           │ │  │
│  │   │   MODE1: 52% win rate, 1.8x profit factor                         │ │  │
│  │   │   MODE2: 68% win rate, 2.9x profit factor                         │ │  │
│  │   │                                                                    │ │  │
│  │   │ By Market State:                                                   │ │  │
│  │   │   CONFIRMED_UPTREND: 65% win rate                                 │ │  │
│  │   │   RALLY_ATTEMPT: 45% win rate                                     │ │  │
│  │   │                                                                    │ │  │
│  │   │ Insights:                                                          │ │  │
│  │   │   • MODE2 trades outperform MODE1 by 16% win rate                 │ │  │
│  │   │   • Best setup: 21dma reclaim & backtest (72% win rate)           │ │  │
│  │   │   • Avoid: Entries in PULLBACK market state (38% win rate)        │ │  │
│  │   └────────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│                              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      7. FEEDBACK TO AGENT                                 │  │
│  │                                                                           │  │
│  │   Performance insights used to:                                          │  │
│  │   • Adjust scoring weights in Focus List ranking                        │  │
│  │   • Tune MODE1/MODE2 position sizing                                     │  │
│  │   • Refine market state permission thresholds                           │  │
│  │   • Improve pullback scan criteria                                       │  │
│  │                                                                           │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │   │             CONTINUOUS IMPROVEMENT LOOP                            │ │  │
│  │   │                                                                    │ │  │
│  │   │   Newsletter ──▶ Agent ──▶ Suggested Trades                       │ │  │
│  │   │       ▲                           │                                │ │  │
│  │   │       │                           ▼                                │ │  │
│  │   │   Insights ◀── Analytics ◀── Actual Trades ◀── Discord            │ │  │
│  │   │                                                                    │ │  │
│  │   └────────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE DATABASE SCHEMA                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Newsletter Data                                                               │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │ daily_reports                                                            │  │
│   │ ├── id (uuid)                                                            │  │
│   │ ├── report_date (date)                                                   │  │
│   │ ├── raw_content (text)                                                   │  │
│   │ ├── market_analysis_text (text)         -- From Text                    │  │
│   │ ├── breadth_text (text)                 -- From Text                    │  │
│   │ ├── mcsi_nasdaq_zscore (decimal)        -- From Image                   │  │
│   │ ├── mco_nasdaq_zscore (decimal)         -- From Image                   │  │
│   │ ├── top_themes (jsonb)                  -- From Image                   │  │
│   │ ├── top_sectors (jsonb)                 -- From Image                   │  │
│   │ └── parsing_confidence (decimal)                                        │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   Discord Data                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │ discord_trades                                                           │  │
│   │ ├── id (uuid)                                                            │  │
│   │ ├── trade_date (date)                                                    │  │
│   │ ├── action (text) -- ENTRY, ADD, TRIM, CLOSE, STOP_OUT                  │  │
│   │ ├── ticker (text)                                                        │  │
│   │ ├── entry_price / exit_price (decimal)                                  │  │
│   │ ├── ssl (decimal)                                                        │  │
│   │ ├── r_multiple (decimal)                                                │  │
│   │ ├── journal_entry_id (uuid) -- FK to discord_journal                    │  │
│   │ └── suggested_trade_id (uuid) -- FK to suggested trades                 │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │ discord_journal                                                          │  │
│   │ ├── id (uuid)                                                            │  │
│   │ ├── entry_date (date)                                                    │  │
│   │ ├── ticker (text)                                                        │  │
│   │ ├── setup_type (text)                                                    │  │
│   │ ├── mode (text) -- MODE1, MODE2                                         │  │
│   │ ├── reasoning (text)                                                     │  │
│   │ └── trade_id (uuid) -- FK to discord_trades                             │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │ discord_portfolio_updates                                                │  │
│   │ ├── id (uuid)                                                            │  │
│   │ ├── update_date (date)                                                   │  │
│   │ ├── commentary (text)                                                    │  │
│   │ ├── sentiment (text)                                                     │  │
│   │ └── key_points (jsonb)                                                   │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   Performance Data                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │ portfolio_performance                                                    │  │
│   │ ├── id (uuid)                                                            │  │
│   │ ├── period_start / period_end (date)                                    │  │
│   │ ├── period_type (text) -- daily, weekly, monthly                        │  │
│   │ ├── win_rate (decimal)                                                   │  │
│   │ ├── profit_factor (decimal)                                              │  │
│   │ ├── mode1_win_rate / mode2_win_rate (decimal)                           │  │
│   │ └── avg_winner_r / avg_loser_r (decimal)                                │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   Agent Data                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │ positions (current portfolio)                                            │  │
│   │ trades (execution log)                                                   │  │
│   │ market_snapshots (daily breadth data)                                   │  │
│   │ breadth_data (historical MCSI/MCO)                                      │  │
│   │ gmail_tokens (OAuth credentials)                                        │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API ENDPOINTS                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Gmail Integration                                                             │
│   ──────────────────────────────────────────────────────────────────────────── │
│   GET  /api/gmail/auth           - Initiate OAuth flow                         │
│   GET  /api/gmail/callback       - OAuth callback                              │
│   GET  /api/gmail/status         - Connection status                           │
│   POST /api/gmail/import         - Import reports from Gmail                   │
│   GET  /api/gmail/import         - List imported reports                       │
│                                                                                  │
│   Discord Integration                                                           │
│   ──────────────────────────────────────────────────────────────────────────── │
│   GET  /api/discord/connect      - Bot connection status                       │
│   POST /api/discord/import       - Import from all channels                    │
│   POST /api/discord/import/[ch]  - Import from specific channel               │
│   GET  /api/discord/performance  - Get performance metrics                     │
│                                                                                  │
│   Market Data                                                                   │
│   ──────────────────────────────────────────────────────────────────────────── │
│   GET  /api/market-data          - OHLC data for ticker                        │
│   GET  /api/rs-data              - Relative strength rankings                  │
│   GET  /api/universe-data        - Universe ticker list                        │
│   GET  /api/earnings-data        - Earnings calendar                           │
│   POST /api/extract-breadth      - Extract breadth from screenshot             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## UI Pages

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 UI PAGES                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   /                          Main Dashboard                                     │
│   ├── Market State           QQQE chart, McClellan, permissions                │
│   ├── Liquid Leaders         Universe scan results                             │
│   ├── Pullback Scan          Pullback candidates                               │
│   ├── Focus List             Ranked candidates                                 │
│   ├── Suggested Trades       Order tickets                                     │
│   ├── Trades Today           Execution log                                     │
│   └── Portfolio              Open positions                                    │
│                                                                                  │
│   /import-reports            Gmail Import                                       │
│   ├── Connect Gmail          OAuth flow                                        │
│   ├── Search Config          Sender, subject filters                           │
│   ├── Import Controls        7/30/90/365 days                                  │
│   └── Report Table           Parsed reports with From Text/From Image labels  │
│                                                                                  │
│   /journal                   Discord Journal (NEW)                              │
│   ├── Trades Tab             #equity-trades history                            │
│   ├── Journal Tab            #alex-journal entries                             │
│   ├── Commentary Tab         #pf-update timeline                               │
│   └── Performance Tab        Win rate, P&L, insights                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

*Last updated: January 2026*
