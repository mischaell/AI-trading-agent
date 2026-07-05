# Alex equity-trades — Setup-Edge Audit (Mode A, mechanical 2R/SL)

Source: data/discord-exports/equity-trades.json · entries parsed: **294** · evaluable: **291** · no price data: 3
Outcome rule: enter at posted entry, exit at 2R target or SL, daily bars, **stop wins same-bar ties**. OPEN = neither hit by today.

## Overall

- Resolved: **291** (still open: 0)
- Win rate: **38.1%**
- Expectancy: **0.147 R per trade** 🟢

### By direction

| Bucket | N | Resolved | Win% | Exp (R) | Open |
|---|--:|--:|--:|--:|--:|
| Long | 286 | 286 | 39% | 0.17 | 0 |
| Short | 5 | 5 | 0% | -1.00 | 0 |

### By quarter (entry)

| Bucket | N | Resolved | Win% | Exp (R) | Open |
|---|--:|--:|--:|--:|--:|
| 2025-Q3 | 36 | 36 | 56% | 0.67 | 0 |
| 2025-Q4 | 88 | 88 | 43% | 0.31 | 0 |
| 2024-Q4 | 106 | 106 | 36% | 0.08 | 0 |
| 2026-Q1 | 30 | 30 | 27% | -0.20 | 0 |
| 2025-Q1 | 31 | 31 | 23% | -0.32 | 0 |

### By ticker (≥4 calls)

| Bucket | N | Resolved | Win% | Exp (R) | Open |
|---|--:|--:|--:|--:|--:|
| MRVL | 4 | 4 | 100% | 2.00 | 0 |
| SNOW | 5 | 5 | 80% | 1.40 | 0 |
| RDDT | 4 | 4 | 75% | 1.25 | 0 |
| SMTC | 5 | 5 | 60% | 0.80 | 0 |
| TSLA | 15 | 15 | 53% | 0.66 | 0 |
| VRT | 13 | 13 | 54% | 0.62 | 0 |
| ARM | 4 | 4 | 50% | 0.50 | 0 |
| CRWD | 4 | 4 | 50% | 0.50 | 0 |
| PLTR | 11 | 11 | 45% | 0.36 | 0 |
| GEV | 5 | 5 | 40% | 0.20 | 0 |
| IBIT | 10 | 10 | 30% | -0.10 | 0 |
| CLS | 7 | 7 | 29% | -0.14 | 0 |
| COHR | 8 | 8 | 25% | -0.25 | 0 |
| SHOP | 8 | 8 | 25% | -0.25 | 0 |
| OKLO | 4 | 4 | 25% | -0.25 | 0 |
| RKLB | 9 | 9 | 22% | -0.33 | 0 |
| HOOD | 5 | 5 | 20% | -0.40 | 0 |
| CRDO | 7 | 7 | 14% | -0.57 | 0 |
| ALAB | 8 | 8 | 13% | -0.62 | 0 |
| NVDA | 7 | 7 | 0% | -1.00 | 0 |
| APP | 4 | 4 | 0% | -1.00 | 0 |
| SOFI | 4 | 4 | 0% | -1.00 | 0 |


_Verify any row: open calls.csv, find the message in equity-trades.json by date+ticker, chart it._