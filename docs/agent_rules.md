# Trading Agent Constitution — Rules (v1.0)
_Last frozen: 2026-01-17 (UTC)_

## Changelog
- **2026-01-17 — v1.0**: Initial frozen contract split into Rules / Tasks / UI Contract. Added state-machine diagram for end-to-end flow.

---

# 0. Global Invariants (Never violate)

1. **Market-first:** No market confirmation → no portfolio risk.
2. **Long-only:** **Never short.**
3. **No rotation trades in downtrends:** Stay focused on liquid growth leaders; do not rotate into defensive/energy/etc.
4. **Daily timeframe only:** All decisions anchored to **daily closes** (intraday is execution-only).
5. **No breakout chasing:** Entries are pullbacks into **21EMA structure** or reclaims near structure.
6. **Structure overrides narrative:** Price/structure > news/sentiment/indicators.
7. **EOD discipline:** Stops and readiness are evaluated on **daily close**, with a single override: **max pain**.
8. **Risk is defined before entry:** Every trade has SSL and max loss defined pre-trade.
9. **Adds are new trades:** Any add must have its own setup, risk and stop (no blind scaling).
10. **Earnings constraint:** No positions initiated if earnings < 7 days away.

---

# 1. Market State Labels (Locked)

## 1.1 State: EARLY CONFIRMATION (Test Turn)
**UI label (short):**
```
Current State: EARLY CONFIRMATION (Test Turn)
```

**Meaning:**
- MCO recently ≤ −1σ → washout / fear condition present
- MCSI has stopped falling and is curling up
- Participation improving but **NOT confirmed**
- Market near / reclaiming 21DMA structure

**Permissions:**
- New Entries: **LIMITED** (test only)
- Adds: **NO**
- Pressing: **NO**
- Trims: **YES**

**Hard prohibitions:**
- No full-size entries
- No adds / pyramids
- No “pressing” exposure

---

# 2. Structure Definition (Locked)

## 2.1 21EMA Structure Cloud
Structure is composed of:
- **MAHigh** = 21EMA(high)
- **MAClose** = 21EMA(close)
- **MALow** = 21EMA(low)

## 2.2 Trend & Bar Color Logic (from your script)
- **Bullish (black)** bar: `close > MAHigh AND close > MAClose AND close > MALow`
- **Bearish (pink)** bar: if enabled `useHighBelowCondition`, then `high < MALow` else `close < MALow AND close < MAClose AND close < MAHigh`
- **Neutral** bar: memory/gray

Daily defaults:
- `dailyLength = 21`
- `dailyType = EMA`
Weekly confluence (optional in playbook):
- `weeklyLength = 10`
- `weeklyType = SMA`

---

# 3. Entry Modes (Locked)

## Mode 1 — Weakness into Structure
- Buy on weakness **into** 21EMA structure zone.
- Best R/R, lower confirmation.

## Mode 2 — Reclaim & Backtest / Confirmation
**Definition (locked):**
> Price reclaims the 21DMA-structure, then pulls back for a clean retest that forms a structure higher low.

Higher confirmation, slightly worse R/R vs Mode 1.

---

# 4. Stop & Exit Rules (Locked)

## 4.1 Structural Stop (SSL)
- SSL is the **MALow (21EMA low band)**.
- **Stop trigger:** daily close below SSL.

## 4.2 Exit timing
- If daily close < SSL → **exit the same day at the close**.

## 4.3 Max pain override (hard)
- If max acceptable loss is reached intraday → **exit immediately** (do not wait for close).

---

# 5. Profit-Taking Rules (Locked)

## 5.1 Trim rule
- At **2R**, sell **1/3** of the position.
- Remaining **2/3** is the runner.

## 5.2 Runner rule
- Runner is held until the daily structure breaks:
  - daily close below **MALow (SSL)** → exit at close (same day)

---

# 6. Risk & Sizing (Locked)

## 6.1 Risk per trade (NER)
- **Mode 1:** 0.25% NER
- **Mode 2:** 0.50% NER

## 6.2 Default position size (agent-led)
- **Mode 1:** 10–12% of equity limit
- **Mode 2:** 12–15% of equity limit

Position size is expressed as:
- `Position Size $ = Equity Limit × Position %`

---

# 7. Focus List Manual Promotion (Locked)

Ranking is rules-based, with **one manual promotion allowed**.

**Manual promotion constraint (strict):**
- Only allowed reason: **Best reclaim & backtest quality**
- Must come from the same pullback candidate set
- If no clear qualifier → no promotion
