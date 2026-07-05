#!/usr/bin/env python3
"""confluence_v2.py — confluence book on the v2 call set (Long + ADD formats).

Unified calls = full export (Long-only era, ..2026-01-22) + gap-entries-v2.jsonl
(both formats, 2026-01-20..). Flags: WC winner-continuation, B single-call day,
C moderate RS 0.05-0.20, G regime CONFIRMED/EARLY. Exit = locked LFD scale-out,
USD cost. Writes calls_v2.json + confluence-trades-v2.md.
"""
import json, re, os, sys, statistics as st
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(HERE, "lfd", "harness")); sys.path.insert(0, HERE)
import score_lfd as S
engine = S.engine

PAT = re.compile(r'\b(Long|ADD\w*)\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?S?SL\s*@\s*([\d.]+)', re.I | re.S)
CUT = "2026-01-01"

def days(a, b):
    return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days

def build_calls():
    seen, calls = set(), []
    exp = json.load(open(os.path.join(ROOT, "data", "discord-exports", "equity-trades.json")))["messages"]
    msgs = [(m["timestamp"], m.get("content", "") or "") for m in exp]
    msgs += [(x["timestamp"], x["content"]) for x in
             map(json.loads, open(os.path.join(ROOT, "audit", "gap-entries-v2.jsonl")))]
    for ts, c in msgs:
        h = PAT.search(c)
        if not h: continue
        d, fmt, size, tkr = ts[:10], h[1].upper()[:3], float(h[2]), h[3].upper()
        e, sl = float(h[4]), float(h[5])
        if (d, tkr) in seen or e <= 0 or e == sl: continue
        seen.add((d, tkr)); calls.append((d, tkr, e, sl, fmt, size))
    calls.sort(key=lambda x: x[0])
    return calls

def main():
    calls = build_calls()
    json.dump(calls, open(os.path.join(HERE, "calls_v2.json"), "w"))
    print(f"v2 call set: {len(calls)} ({sum(1 for c in calls if c[4]=='ADD')} ADD), "
          f"{calls[0][0]} .. {calls[-1][0]}")

    states = json.load(open(os.path.join(HERE, "regime_states.json")))
    sdates = sorted(states)
    def state_at(d):
        p = [x for x in sdates if x < d]
        return states[p[-1]] if p else None
    per_day = {}
    for d, *_ in calls: per_day[d] = per_day.get(d, 0) + 1

    strat = dict(S.STRATEGY); strat["filter"] = "all"
    legs = []
    for date, tkr, e, sl, fmt, size in calls:
        if tkr in _EXCLUDED: continue   # split-corrupted posted prices (dataset stamp)
        bars = engine.load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
        if i0 is None or i0 < 25: continue
        p = i0 - 1
        e21 = engine.ema([b["close"] for b in bars[:p + 1]], 21)[p]
        a14 = engine.atr(bars, 14, p)
        if e21 is None or a14 in (None, 0): continue
        risk = e - sl
        if risk <= 0: continue
        t20 = bars[p]["close"] / bars[p - 20]["close"] - 1 if p >= 20 else None
        q20 = engine.qret(bars[p]["date"], 20)
        rs = (t20 - q20) if (t20 is not None and q20 is not None) else None
        R, mfe, op, xi = S.decide_exit(strat, bars, i0, e, sl, risk)
        legs.append(dict(date=date, tkr=tkr, e=e, sl=sl, risk=risk, bars=bars, open=op,
                         fmt=fmt, R=round(R - (S.FX_PCT / 100.0) / (risk / e), 2),
                         xd=bars[xi]["date"], rs=rs))
    bytkr = {}
    for l in legs: bytkr.setdefault(l["tkr"], []).append(l)
    for tkr, ls in bytkr.items():
        ls.sort(key=lambda l: l["date"])
        for prev, l in zip(ls, ls[1:]):
            if l["date"] <= prev["xd"]:
                j = max(i for i, b in enumerate(l["bars"]) if b["date"] < l["date"])
                if (l["bars"][j]["close"] - prev["e"]) / prev["risk"] > 0: l["WC"] = True
            elif days(prev["xd"], l["date"]) <= 14 and prev["R"] > 0:
                l["WC"] = True
    for l in legs:
        f = dict(WC=l.get("WC", False), B=per_day[l["date"]] == 1,
                 C=l["rs"] is not None and 0.05 <= l["rs"] <= 0.20,
                 G=state_at(l["date"]) in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION"))
        l["score"] = sum(f.values())
        l["flags"] = "+".join(k for k, v in f.items() if v)

    print("\nconfluence score (v2 data):")
    for split, lo, hi in (("DEV", "", CUT), ("HOLDOUT", CUT, "9999")):
        row = []
        for sc in range(5):
            xs = [l["R"] for l in legs if l["score"] == sc and lo <= l["date"] < hi]
            row.append(f"s{sc} {st.fmean(xs):+.3f}(n={len(xs)})" if xs else f"s{sc} -")
        print(f"  {split:8} " + "  ".join(row))

    print("\n2026 tiers (v2):")
    for tier, sel, rf in (("half(s2)", lambda l: l["score"] == 2, 0.005),
                          ("FULL(s>=3)", lambda l: l["score"] >= 3, 0.01)):
        xs = [l["R"] for l in legs if sel(l) and l["date"] >= CUT]
        print(f"  {tier:11} n={len(xs):3}  avg {st.fmean(xs):+.3f}R  "
              f"win {sum(1 for x in xs if x > 0)/len(xs)*100:3.0f}%  total {sum(xs):+6.1f}R  "
              f"acct {sum(xs)*rf*100:+.2f}%")

    print("\nrecovered ADD legs, scored:")
    for l in legs:
        if l["fmt"] == "ADD":
            print(f"  {l['date']}  {l['tkr']:5} score {l['score']} [{l['flags']:10}] "
                  f"-> {l['R']:+.2f}R{' open' if l['open'] else ''}")

    sel = [l for l in legs if l["score"] >= 2]
    sel.sort(key=lambda r: r["date"])
    eq = 1.0
    lines = ["# Confluence book v2 (Long + ADD calls)", "",
             "| # | date | ticker | fmt | flags | tier | entry | stop | R | acct Δ |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for i, r in enumerate(sel, 1):
        rf = 0.01 if r["score"] >= 3 else 0.005
        dlt = rf * r["R"]; eq *= (1 + dlt)
        o = " (open)" if r["open"] else ""
        lines.append(f"| {i} | {r['date']} | {r['tkr']} | {r['fmt']} | {r['flags']} | "
                     f"{'FULL' if r['score'] >= 3 else 'half'} | {r['e']} | {r['sl']} | "
                     f"{r['R']:+.2f}{o} | {dlt*100:+.2f}% |")
    lines += ["", f"Compounded at 0.5%/1% tiers: {(eq-1)*100:+.1f}% over the full period."]
    open(os.path.join(HERE, "confluence-trades-v2.md"), "w").write("\n".join(lines))
    print(f"\n{len(sel)} tiered trades -> confluence-trades-v2.md   "
          f"account {(eq-1)*100:+.1f}% compounded")

if __name__ == "__main__":
    main()
