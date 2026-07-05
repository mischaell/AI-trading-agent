#!/usr/bin/env python3
"""Momentum-basket weekly readout. Computes the LIVE regime state (the app's real
MCO/MCSI breadth + QQQE structure -> 5-state machine) and the current top-25
momentum basket, prints a Telegram-ready readout, and flags week-over-week
changes (regime flips + basket adds/drops). State at ~/mission-control/momentum-basket/.

Regime engine faithful to src/tasks/market-analysis.ts + src/lib/market-data/calculate-breadth.ts:
  MCO = EMA19(netAdv) - EMA39(netAdv) over the 101 Nasdaq-100 names; MCSI = cumsum(MCO);
  both z-scored 252d. QQQE 21EMA cloud = structure. State -> new_entries permission.
Usage: python3 basket_readout.py   (prints readout; STATE_DIR holds last-week state)
"""
import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

ICON = {"FULL": "\U0001F7E2", "REDUCED": "\U0001F7E1", "CASH": "\U0001F534"}

STATE_DIR = os.path.expanduser("~/mission-control/momentum-basket")
STATE = os.path.join(STATE_DIR, "state.json")
N100 = "AAPL MSFT NVDA GOOGL GOOG AMZN META TSLA AVGO COST ADBE AMD NFLX CSCO INTC QCOM INTU TXN AMAT MU LRCX KLAC SNPS CDNS MRVL NXPI ON ADI MCHP ASML CRM ADSK PANW CRWD DDOG ZS FTNT WDAY TEAM MDB CSGP CTSH CDW BKNG ABNB DASH MELI PYPL TTD TTWO EA AMGN GILD REGN VRTX ISRG IDXX DXCM ILMN BIIB MRNA GEHC AZN TMUS CMCSA CHTR WBD PEP KDP MNST KHC MDLZ SBUX LULU ROST ORLY CPRT DLTR FAST ODFL PCAR CSX HON GE CEG XEL EXC AEP BKR FANG CTAS PAYX VRSK ADP MAR RCL EXPE PDD JD BIDU NTES".split()
UNIVERSE = "AAPL MSFT GOOGL GOOG AMZN META NVDA TSLA AVGO NFLX ORCL CRM ADBE AMD INTC QCOM TXN MU AMAT LRCX KLAC ARM SMCI DELL CSCO IBM NOW INTU PANW CRWD ZS FTNT SNOW DDOG NET MDB DASH ABNB UBER SHOP PYPL COIN HOOD SOFI AFRM ON MPWR ADI MCHP NXPI SWKS QRVO TER ENTG WOLF MRVL LSCC SLAB ALGM AMKR FORM ACLS ONTO COHR LITE FN VRT ANET PSTG NTAP WDC STX CIEN ALAB CRDO NBIS APLD IREN CORZ VST CEG NRG TLN GEV ETN PWR NVT TEAM WDAY VEEV HUBS TTD APP PLTR GTLB S U PATH BILL ESTC CFLT BKNG MELI PINS SNAP RBLX SPOT DKNG ROKU CHWY CVNA CART DUOL V MA AXP NU TOST RIVN ENPH FSLR BABA PDD JD LI XPEV LLY VRTX REGN ISRG DXCM PODD AMGN GILD GE BA CAT DE HON RTX LMT AXON XOM CVX COP EOG FANG SLB MPC PSX VLO LNG CCJ COST WMT HD LOW NKE LULU SBUX MCD CMG ELF DECK RKLB LUNR ASTS QBTS RGTI IONQ SOUN BE CLS FTAI POWL TSM ASML NVO MSTR".split()

def ema_run(v, n):
    k = 2/(n+1); out = [v[0]]
    for i in range(1, len(v)): out.append(v[i]*k + out[-1]*(1-k))
    return out
def zscore(v, i, w=252):
    s = v[max(0, i-w+1):i+1]
    if len(s) < 20: return 0.0
    m = sum(s)/len(s); sd = (sum((x-m)**2 for x in s)/len(s))**0.5
    return (v[i]-m)/sd if sd > 0 else 0.0

def compute():
    qqq = engine.load("QQQ"); qe = engine.load("QQQE")
    days = [b["date"] for b in qqq]
    # align N100 closes -> advances/declines -> MCO/MCSI
    al = {}
    for s in N100:
        b = engine.load(s)
        if not b: continue
        m = {x["date"]: x["close"] for x in b}; a = []; last = None
        for d in days:
            if d in m and m[d] is not None: last = m[d]
            a.append(last)
        al[s] = a
    netadv = [0]
    for i in range(1, len(days)):
        adv = dec = 0
        for s, v in al.items():
            if v[i] is not None and v[i-1] not in (None, 0):
                if v[i] > v[i-1]: adv += 1
                elif v[i] < v[i-1]: dec += 1
        netadv.append(adv - dec)
    mco = [a-b for a, b in zip(ema_run(netadv, 19), ema_run(netadv, 39))]
    mcsi = []; acc = 0
    for x in mco: acc += x; mcsi.append(acc)
    i = len(days)-1
    mcoZ, mcsiZ = zscore(mco, i), zscore(mcsi, i)
    mcoChg = mco[i]-mco[i-1]
    # QQQE structure (align qe to its own bars)
    eh = ema_run([b["high"] for b in qe], 21); ec = ema_run([b["close"] for b in qe], 21); el = ema_run([b["low"] for b in qe], 21)
    j = len(qe)-1; c = qe[j]["close"]; top = max(eh[j], ec[j], el[j]); bot = min(eh[j], ec[j], el[j])
    pos = "above_cloud" if c > top else ("below_cloud" if c < bot else "inside_cloud")
    pc = (ec[j]-ec[j-1])/ec[j-1]*100
    slope = "rising" if pc > 0.05 else ("falling" if pc < -0.05 else "flat")
    mcsiSlope = "curling_up" if mcsiZ >= zscore(mcsi, i-1) else "curling_down"
    # state machine
    if pos == "above_cloud":
        st = "CONFIRMED_UPTREND" if (slope == "rising" or mcsiSlope == "curling_up" or mcoZ > 0) else "EARLY_CONFIRMATION"
    elif pos == "inside_cloud":
        st = "EARLY_CONFIRMATION" if (slope == "rising" or (slope == "flat" and (mcsiSlope == "curling_up" or mcoZ >= 0))) else "PARTICIPATION_FADE"
    else:
        st = "WASHOUT" if mcoZ < -2 else ("EARLY_CONFIRMATION" if (slope == "rising" or (mcsiSlope == "curling_up" and mcoZ > -1)) else "BREAKDOWN")
    direction = ("HOOK_UP" if mcoChg > 3 else "EXPANDING" if mcoChg > 1 else "HOOK_DOWN" if mcoChg < -3 else "CONTRACTING" if mcoChg < -1 else "FLAT")
    allow = {"CONFIRMED_UPTREND": "FULL", "EARLY_CONFIRMATION": "REDUCED", "PARTICIPATION_FADE": "CASH", "BREAKDOWN": "CASH", "WASHOUT": "CASH"}[st]
    # top-25 momentum (40d, risers)
    ranked = []
    for s in set(UNIVERSE):
        b = engine.load(s)
        if not b or len(b) < 41: continue
        k = len(b)-1
        if b[k]["close"] and b[k-40]["close"]:
            r = b[k]["close"]/b[k-40]["close"]-1
            if r > 0: ranked.append((r, s))
    ranked.sort(reverse=True); top = [(s, round(r*100, 1)) for r, s in ranked[:25]]
    return dict(date=days[-1], state=st, allow=allow, pos=pos, slope=slope,
                mcoZ=round(mcoZ, 2), mcsiZ=round(mcsiZ, 2), direction=direction, top=top)

def is_full(cur, prev):
    """Full readout on: first run, regime-state change, gate-level change, or Mondays."""
    if prev is None or prev.get("state") != cur["state"] or prev.get("allow") != cur["allow"]:
        return True
    try:
        return datetime.date.fromisoformat(cur["date"]).weekday() == 0  # Monday recap
    except Exception:
        return False

def compact(cur, prev):
    flip = f" (was {prev['state']})" if prev and prev.get("state") != cur["state"] else " (no change)"
    top3 = ", ".join(f"{s} {m:+.0f}%" for s, m in cur["top"][:3])
    return (f"\U0001F4CA {cur['date']} — REGIME {cur['state']} {ICON[cur['allow']]} {cur['allow']}{flip} | "
            f"MCO z {cur['mcoZ']:+} ({cur['direction']}) | leaders: {top3}")

def readout(cur, prev):
    icon = ICON[cur["allow"]]
    L = [f"\U0001F4CA Momentum Basket — {cur['date']}",
         f"REGIME: {cur['state']} {icon} {cur['allow']}",
         f"  QQQE {cur['pos'].replace('_',' ')}, slope {cur['slope']} | MCO z {cur['mcoZ']:+} ({cur['direction']}) | MCSI z {cur['mcsiZ']:+}"]
    if prev and prev.get("state") != cur["state"]:
        L.append(f"  ⚠️ changed from {prev['state']} ({prev['allow']}) last week")
    names = [s for s, _ in cur["top"]]
    if cur["allow"] == "CASH":
        L.append("  → gate OFF: hold cash/CSH2. Basket below is watch-only.")
    L.append("Top-25 leaders (40d mom):")
    L.append("  " + ", ".join(f"{s} {m:+.0f}%" for s, m in cur["top"][:12]))
    L.append("  " + ", ".join(f"{s} {m:+.0f}%" for s, m in cur["top"][12:]))
    if prev and prev.get("top"):
        pset = {s for s, _ in prev["top"]}; cset = set(names)
        added = [s for s in names if s not in pset]; dropped = [s for s in pset if s not in cset]
        if added or dropped:
            L.append(f"  Δ +{','.join(added) or '-'}  −{','.join(dropped) or '-'}")
    return "\n".join(L)

def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    prev = json.load(open(STATE)) if os.path.exists(STATE) else None
    cur = compute()
    print(readout(cur, prev) if is_full(cur, prev) else compact(cur, prev))
    json.dump(cur, open(STATE, "w"), indent=2)

if __name__ == "__main__":
    main()
