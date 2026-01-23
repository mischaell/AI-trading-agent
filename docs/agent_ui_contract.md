# Trading Agent Constitution — UI Contract (v1.0)
_Last frozen: 2026-01-17 (UTC)_

## Changelog
- **2026-01-17 — v1.0**: Initial UI contract. Standardized panel layout and output formats for each task.

---

# UI Navigation (Top Level)

```
Market State | Liquid Leaders | Pullback Scan | Focus List | Trades Today | Portfolio
```

Each tab renders the **latest cached output** of its corresponding task.

---

# Panel 1 — Market State

### Always-visible header
```
Current State: EARLY CONFIRMATION (Test Turn)
```

### Compact metrics table
| Metric | Value |
|---|---:|
| QQQE vs 21EMA structure | Inside cloud |
| 21EMA structure slope | Rising |
| MCO (z) | -0.69 |
| MCSI (z) | -0.38 |
| MCSI trend | Curling up (below 10dma) |

### Permissions strip
```
New Entries: LIMITED | Adds: NO | Pressing: NO | Trims: YES
```

---

# Panel 2 — Liquid Leaders (Universe)

### Output
- Show ticker list (30–40)
- Optional: small cards (ticker + bar color + dist to structure)

---

# Panel 3 — Pullback Scan (5–10)

### Output
- Show ticker list (5–10)
- Optional: small “near-structure” badges:
  - `-0.5..+1.0 ATR from 21EMA`

---

# Panel 4 — Focus List (Top 5) + Readiness Table

### Focus list chips
```
QBTS*  RDDT  ALAB  CVNA  VRT
* Manual promotion: Best reclaim & backtest quality
```

### Readiness table (monochrome)
| Rank | Ticker | Mode | READY (EOD) | Dist→21EMA (ATR) | Earnings (d) | Reclaim/Backtest |
|---:|---|---:|---|---:|---:|---|
| 1 | QBTS* | 2 | ✅ | +0.2 | 10 | A |
| 2 | RDDT | 2 | ✅ | +0.4 | 14 | B |

---

# Panel 5 — Trades Today (last 24h)

| Time (UTC) | Action | Ticker | Shares | Price | Notes |
|---|---|---|---:|---:|---|
| 15:52 | BUY | QBTS | 416 | 28.84 | Mode 2, READY (EOD) |
| 15:52 | SELL (1/3) | QBTS | 139 | 33.00 | 2R Trim |
| 15:55 | BUY | ALAB | 58 | 171.85 | Mode 1, READY (EOD) |

---

# Panel 6 — Portfolio

### Summary tiles
```
Gross Exposure: 114%     New Exposure Risk (NER): 1.24%
Open Heat: +13.96%       Secured Profits: +0.22%
```

### Portfolio table
| Ticker | Side | Weight | Entry | SSL (21EMA low) | Trimmed | Secured P&L | Open Heat | Total R | EC % |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| QBTS | Long | 11.2% | 28.84 | 27.19 | 0% | -0.64% | -0.70% | 0.1 | 0.06% |
| ALAB | Long | 8.3% | 171.85 | 162.18 | 0% | -0.44% | -0.90% | 0.9 | 0.46% |
