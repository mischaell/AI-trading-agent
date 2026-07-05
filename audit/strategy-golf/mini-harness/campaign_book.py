#!/usr/bin/env python3
"""campaign_book.py — the campaign paper book (start small, add on strength,
hold until the trend breaks). Backtest-validated 2026-07-05; parameters FROZEN:

  account          $100,000 paper, USD
  risk unit        0.5% = $500
  starter          0.25 units = $125 risk on every new Alex call in a ticker
                   with no open campaign, if stop width >= 2%
  add              0.375 units = $187.50 risk when Alex posts another call in
                   the ticker AND the starter is in profit (prior close >
                   starter entry); max 1.0 unit total per campaign
  ignore           his adds while the position is losing (falsified leg class)
  trims            NO profit trims (every tested trim cut returns ~40-60%);
                   TRIM alerts = defensive only (an add stopped at its own SL)
  sell             2 consecutive closes below the 21-day EMA of daily lows
                   (ratchets up only), or any single close below the starter's
                   posted SL

State: ~/mission-control/alex-forward-test/campaign_book.json
Alerts printed to stdout: BUY / ADD / TRIM / SELL lines (runners grep + send).
Usage:
  campaign_book.py --candidates FILE   process new calls -> BUY/ADD alerts
  campaign_book.py --advance           walk new daily bars -> TRIM/SELL alerts
"""
import json, os, sys
from datetime import datetime

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
STATE = os.path.join(STATE_DIR, "campaign_book.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

BOOK, UNIT = 100_000, 0.005          # $500 per risk unit
PILOT_U, ADD_U, MAX_U = 0.25, 0.375, 1.0
MIN_W = 0.02                          # no razor-thin stops

def load():
    if os.path.exists(STATE): return json.load(open(STATE))
    return dict(campaigns=[], seen=[], realized_usd=0.0, closed=0, wins=0)

def save(st): json.dump(st, open(STATE, "w"), indent=2)

def dollars(u): return u * BOOK * UNIT

def open_campaign(st, tkr):
    return next((c for c in st["campaigns"] if c["ticker"] == tkr and c["status"] == "open"), None)

def fmt_px(x): return f"{x:,.2f}"

def process_candidates(st, cands):
    alerts = []
    for c in cands:
        key = f"{c['ticker']}:{c['date']}"
        if key in st["seen"]: continue
        st["seen"].append(key)
        tkr, e, sl = c["ticker"], float(c["entry"]), float(c["sl"])
        if e <= sl: continue
        w = (e - sl) / e
        camp = open_campaign(st, tkr)
        if w < MIN_W:
            print(f"campaign_book: {key} skipped (stop {w*100:.1f}% < 2% floor)")
            continue
        bars = engine.load(tkr)
        if not bars: continue
        eb = next((b for b in bars if b["date"] >= c["date"]), None)
        if eb and not (eb["low"] * 0.85 <= e <= eb["high"] * 1.15):
            print(f"campaign_book: {key} skipped (posted entry {e} outside day range "
                  f"{eb['low']:.2f}-{eb['high']:.2f} — split-adjusted data mismatch)")
            continue
        if camp is None:
            # half-size starter if restarting <=14d after a LOSING campaign in
            # this name (his churn window; class was -1.7R/unit in 2025 —
            # halving improves both years, and adds rebuild real winners)
            prior = [x for x in st["campaigns"] if x["ticker"] == tkr and x["status"] == "closed"]
            restart = False
            if prior:
                last = max(prior, key=lambda x: x["last_date"])
                gap = (datetime.strptime(c["date"], "%Y-%m-%d")
                       - datetime.strptime(last["last_date"], "%Y-%m-%d")).days
                restart = last["realized"] < 0 and 0 <= gap <= 14
            pu = PILOT_U * (0.5 if restart else 1.0)
            risk = dollars(pu)
            sh = max(1, round(risk / (e - sl)))
            st["campaigns"].append(dict(
                ticker=tkr, status="open", opened=c["date"], stop=sl, below=0,
                realized=0.0, last_date=c["date"],
                tranches=[dict(date=c["date"], e=e, sl=sl, sh=sh, starter=True)]))
            elow = engine.ema([b["low"] for b in bars], 21)
            trail = elow[-1] if elow and elow[-1] is not None else sl
            tag = " | restart after loss, HALF size" if restart else ""
            alerts.append(f"BUY {tkr} | {sh} sh @ {fmt_px(e)} = ${sh*e:,.0f} | risk ${risk:,.0f} "
                          f"| SL {fmt_px(sl)} ({-(w*100):.1f}%) | sell: 2 closes < 21d-low EMA (now {fmt_px(trail)}){tag}")
        else:
            starter = camp["tranches"][0]
            prev_close = bars[-1]["close"]
            for i in range(len(bars) - 1, -1, -1):
                if bars[i]["date"] < c["date"]: prev_close = bars[i]["close"]; break
            units_now = sum((PILOT_U if t["starter"] else ADD_U) for t in camp["tranches"] if t["sh"] > 0)
            if prev_close <= starter["e"]:
                print(f"campaign_book: {key} ignored (his add, but position not in profit: "
                      f"{fmt_px(prev_close)} <= starter {fmt_px(starter['e'])})")
                continue
            if units_now + ADD_U > MAX_U + 1e-9:
                print(f"campaign_book: {key} ignored (already at full size)")
                continue
            risk = dollars(ADD_U)
            sh = max(1, round(risk / (e - sl)))
            camp["tranches"].append(dict(date=c["date"], e=e, sl=sl, sh=sh, starter=False))
            tot_sh = sum(t["sh"] for t in camp["tranches"])
            tot_val = sum(t["sh"] * e for t in camp["tranches"])
            tot_risk = dollars(units_now + ADD_U)
            alerts.append(f"ADD {tkr} | {sh} sh @ {fmt_px(e)} = ${sh*e:,.0f} | risk ${risk:,.0f} | SL {fmt_px(sl)} "
                          f"| position now {tot_sh} sh ~${tot_val:,.0f}, total risk ${tot_risk:,.0f}")
    return alerts

def advance(st, until=None):
    alerts = []
    for camp in st["campaigns"]:
        if camp["status"] != "open": continue
        tkr = camp["ticker"]
        bars = engine.load(tkr)
        if not bars: continue
        elow = engine.ema([b["low"] for b in bars], 21)
        start = next((i for i, b in enumerate(bars) if b["date"] > camp["last_date"]), len(bars))
        starter = camp["tranches"][0]
        for j in range(start, len(bars)):
            b = bars[j]
            if until and b["date"] > until: break
            if j > 0 and bars[j-1]["close"] and abs(b["close"]/bars[j-1]["close"] - 1) > 0.40:
                camp["status"] = "frozen"
                alerts.append(f"TRIM {tkr} | FROZEN — close jumped {bars[j-1]['close']:.2f} -> "
                              f"{b['close']:.2f} (possible split/rebase); manual check needed, no auto-sell")
                break
            camp["last_date"] = b["date"]
            # defensive trim: an add closes below its own SL -> that slice exits
            for t in camp["tranches"]:
                if not t["starter"] and t["sh"] > 0 and b["close"] < t["sl"]:
                    pnl = t["sh"] * (b["close"] - t["e"])
                    camp["realized"] += pnl
                    rem_sh = sum(x["sh"] for x in camp["tranches"]) - t["sh"]
                    alerts.append(f"TRIM {tkr} | sold add of {t['sh']} sh @ {fmt_px(b['close'])} "
                                  f"(closed below its SL {fmt_px(t['sl'])}) | {pnl:+,.0f} USD "
                                  f"| remaining {rem_sh} sh")
                    t["sh"] = 0
            if elow[j] is not None and elow[j] > camp["stop"]: camp["stop"] = round(elow[j], 4)
            camp["below"] = camp["below"] + 1 if b["close"] < camp["stop"] else 0
            hard = b["close"] < starter["sl"]
            if hard or camp["below"] >= 2:
                px = b["close"]
                pnl = sum(t["sh"] * (px - t["e"]) for t in camp["tranches"] if t["sh"] > 0)
                camp["realized"] += pnl
                tot = camp["realized"]
                risk0 = dollars(PILOT_U)
                sh_out = sum(t["sh"] for t in camp["tranches"] if t["sh"] > 0)
                why = (f"closed below starter SL {fmt_px(starter['sl'])}" if hard
                       else f"2 closes below trend {fmt_px(camp['stop'])}")
                alerts.append(f"SELL {tkr} | closed {sh_out} sh @ {fmt_px(px)} ({why}) "
                              f"| campaign {tot:+,.0f} USD ({tot/risk0:+.1f}R on starter risk)")
                camp["status"] = "closed"
                st["realized_usd"] += tot
                st["closed"] += 1
                st["wins"] += 1 if tot > 0 else 0
                break
    return alerts

def main():
    st = load()
    alerts = []
    if "--candidates" in sys.argv:
        path = sys.argv[sys.argv.index("--candidates") + 1]
        cands = json.load(open(path)) if os.path.exists(path) else []
        alerts += process_candidates(st, cands)
    if "--advance" in sys.argv:
        alerts += advance(st)
        openc = [c for c in st["campaigns"] if c["status"] == "open"]
        print(f"campaign_book: {len(openc)} open, {st['closed']} closed "
              f"({st['wins']} wins), realized ${st['realized_usd']:+,.0f}")
    save(st)
    for a in alerts: print(a)

if __name__ == "__main__":
    main()
