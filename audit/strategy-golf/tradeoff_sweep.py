#!/usr/bin/env python3
"""tradeoff_sweep.py — risk/profit frontier for the two proposed rule changes
(2026-07-05). Base = THE BOOK (core names, ATR ladder, B tighten + C regime).

Axis 1  qualification memory (catch more winners)
        A0 off (current: 2 calls in 90d only)
        A6/A12/A18: ONE call re-qualifies a ticker that was core within
        6/12/18 months (new names still need 2-in-90d)
Axis 2  exit patience (let winners run)
        E0 current (single close below trail; regime-halving applies to all)
        E1 exit needs 2 consecutive closes below trail
        E2 E1 + winners (>+6 ATR gain) exempt from regime-halving
        E3 E2 + trail never tighter than 2.0*ATR for winners
Metrics per cell/year: net at SIPP FX, sum of losses taken (risk paid),
n positions, 2026 realized share. Full grid shown — no cherry-picking.
"""
import json, os, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine
import stamp as _stamp
_STAMP = _stamp.require_stamp()

SLICE = 2500

def d2dt(d): return datetime.strptime(d, "%Y-%m-%d")

def run(requal_days, exit_mode):
    calls = json.load(open(os.path.join(HERE, "calls_v2.json")))
    states = json.load(open(os.path.join(HERE, "regime_states.json")))
    sdates = sorted(states)
    def risk_on(d):
        p = [x for x in sdates if x < d]
        return bool(p) and states[p[-1]] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION")

    entries = {}
    for d, tkr, e, sl, fmt, size in calls:
        entries.setdefault(tkr, []).append(d)

    positions = []
    for tkr, dates in entries.items():
        bars = engine.load(tkr)
        if not bars or len(bars) < 40: continue
        closes = [b["close"] for b in bars]
        dates = sorted(dates)
        pos = None; consumed = -1; last_core = None
        for si, d in enumerate(dates):
            if si <= consumed or pos is not None: continue
            two_in_90 = bool([x for x in dates if x < d and (d2dt(d) - d2dt(x)).days <= 90])
            returning = (requal_days and last_core
                         and (d2dt(d) - d2dt(last_core)).days <= requal_days)
            if not (two_in_90 or returning): continue
            i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
            if i0 is None or i0 < 20: continue
            a0 = engine.atr(bars, 14, i0)
            if not a0: continue
            last_core = d
            px = closes[i0]
            pos = dict(basis=px, atr0=a0, lots=[(SLICE / px, px)], peak=px,
                       adds=0, legs=1, opened=bars[i0]["date"], below=0)
            j = i0 + 1
            while j < len(bars):
                b = bars[j]; c = b["close"]
                a = engine.atr(bars, 14, j) or a0
                pos["peak"] = max(pos["peak"], c)
                gain = (c - pos["basis"]) / pos["atr0"]
                while pos["adds"] < 2 and gain >= 3 * (pos["adds"] + 1):
                    pos["lots"].append((SLICE / c, c)); pos["adds"] += 1; pos["legs"] += 1
                w = 3.0
                if gain > 12: w = 1.5
                elif gain > 6: w = 2.0
                if exit_mode >= 3 and gain > 6: w = max(w, 2.0)
                halve = not risk_on(b["date"])
                if exit_mode >= 2 and gain > 6: halve = False
                if halve: w /= 2
                below_now = c < pos["peak"] - w * a
                pos["below"] = pos["below"] + 1 if below_now else 0
                need = 2 if exit_mode >= 1 else 1
                if pos["below"] >= need:
                    cost = sum(s * p for s, p in pos["lots"])
                    positions.append(dict(tkr=tkr, opened=pos["opened"], closed=b["date"],
                                          legs=pos["legs"] + 1, notional=SLICE * (1 + pos["adds"]),
                                          pnl=sum(s for s, _ in pos["lots"]) * c - cost,
                                          realized=True))
                    pos = None
                    consumed = max((k for k, dd in enumerate(dates) if dd <= b["date"]), default=si)
                    break
                j += 1
            if pos is not None:
                cost = sum(s * p for s, p in pos["lots"])
                positions.append(dict(tkr=tkr, opened=pos["opened"], closed=None,
                                      legs=pos["legs"], notional=SLICE * (1 + pos["adds"]),
                                      pnl=sum(s for s, _ in pos["lots"]) * closes[-1] - cost,
                                      realized=False))
                pos = "sealed"
    return positions

def cell(positions, year):
    ps = [p for p in positions if p["opened"][:4] == year or (year == "2025" and p["opened"][:4] == "2024")]
    if not ps: return None
    gross = sum(p["pnl"] for p in ps)
    legs = sum(p["legs"] for p in ps)
    avg_n = sum(p["notional"] for p in ps) / max(legs, 1)
    losses = sum(p["pnl"] for p in ps if p["pnl"] < 0)
    return dict(n=len(ps), net_sipp=gross - legs * avg_n * 0.01,
                net_usd=gross - legs * avg_n * 0.001, losses=losses,
                paper=sum(p["pnl"] for p in ps if not p["realized"]))

def main():
    A = [(0, "A0 off"), (180, "A6"), (365, "A12"), (540, "A18")]
    E = [(0, "E0 now"), (1, "E1 2-consec"), (2, "E2 +immunity"), (3, "E3 +floor")]
    print(f"{'cell':16}{'25 netSIPP':>11}{'25 losses':>11}{'26 netSIPP':>11}{'26 losses':>11}{'26 paper':>10}{'n26':>5}")
    for rq, alab in A:
        for em, elab in E:
            pos = run(rq, em)
            c25, c26 = cell(pos, "2025"), cell(pos, "2026")
            print(f"{alab+'/'+elab:16}{c25['net_sipp']:>+11,.0f}{c25['losses']:>+11,.0f}"
                  f"{c26['net_sipp']:>+11,.0f}{c26['losses']:>+11,.0f}{c26['paper']:>+10,.0f}{c26['n']:>5}")

if __name__ == "__main__":
    main()
