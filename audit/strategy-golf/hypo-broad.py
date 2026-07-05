#!/usr/bin/env python3
"""More statistical power: apply Alex's rulebook (strong regime + 2R/5R/runner
scale-out) to a BROAD liquid US universe, not just his 186-name watchlist -- the
setups he 'should have done' in names he doesn't watch. Grows n (esp. OOS) to
tighten the CI and test whether the edge is the SETUP or his stock-picking.
Survivorship caveat: a current broad list mildly favors names that became leaders;
the $vol>=100m + RS + regime filters self-select leaders point-in-time. Watchlist-
only result (his 186) is the conservative anchor. USD cost."""
import sys, random; sys.path.insert(0,"audit/strategy-golf")
import engine
from collections import defaultdict
random.seed(42)
RS_LO,RS_HI=0.05,0.20; FX=0.001; COOLDOWN=10
WIN_START,WIN_END="2024-11-01","2026-06-09"

BROAD = """AAPL MSFT GOOGL GOOG AMZN META NVDA TSLA AVGO NFLX ORCL CRM ADBE AMD INTC QCOM TXN MU AMAT LRCX KLAC ARM SMCI DELL HPQ CSCO IBM NOW INTU PANW CRWD ZS FTNT SNOW DDOG NET MDB DASH ABNB UBER SHOP PYPL COIN HOOD SOFI AFRM ON MPWR ADI MCHP NXPI SWKS QRVO TER ENTG WOLF MRVL LSCC POWI SLAB ALGM AMKR FORM ACLS ONTO COHR LITE FN VIAV CRUS VRT ANET PSTG NTAP WDC STX CIEN ALAB CRDO NBIS APLD IREN CORZ VST CEG NRG TLN GEV ETN PWR NVT TEAM WDAY VEEV HUBS TTD APP PLTR GTLB S U PATH AI BILL DOCN FROG ESTC CFLT BRZE BKNG MELI PINS SNAP RBLX SPOT DKNG ROKU CHWY ETSY W CVNA CART DUOL V MA AXP FI GPN FIS NU TOST RIVN LCID ENPH FSLR SEDG RUN ALB BABA PDD JD BIDU NTES TCOM LI XPEV NIO BILI LLY VRTX REGN MRNA ISRG DXCM PODD ABBV AMGN GILD BIIB INCY ALNY NBIX EXAS GE BA CAT DE HON UNP RTX LMT NOC GD HWM HEI TDG AXON PH ROK EMR XOM CVX COP EOG FANG DVN OXY SLB HAL MPC PSX VLO LNG CCJ UEC COST WMT TGT HD LOW NKE LULU SBUX MCD CMG ELF DECK ANF TPR RL RKLB LUNR ASTS QBTS RGTI IONQ SOUN BE PLUG TMC USAR SITM CLS FTAI POWL UAL DAL TSM ASML NVO BNTX MSTR"""

calls=engine.load_calls()
watch=sorted({t for _,t,_,_ in calls})
broad=sorted(set(BROAD.split()))
universe=sorted(set(watch)|set(broad))
print(f"watchlist {len(watch)} | broad list {len(broad)} | union {len(universe)} names. fetching/loading...")

def strong_regime(d):
    if not engine.strong_regime(d): return False
    dd=engine._near(d, engine._qix); i=engine._qix[dd] if dd else None
    if i is None or engine._qsma[i] is None or engine._qsma[i-10] is None: return False
    mom=engine.qret(d,20)
    return engine._qsma[i]>engine._qsma[i-10] and (mom is not None and mom>0)
def ema_rising(e,i,k=5): return i>=k and e[i] is not None and e[i-k] is not None and e[i]>e[i-k]
def scaleout(bars,i0,entry,risk,e21low):
    stop=entry-risk; t1=entry+2*risk; t2=entry+5*risk; rem=1.0; r=0.0; h1=h2=False
    for j in range(i0+1,len(bars)):
        b=bars[j]
        if e21low[j] is not None: stop=max(stop,e21low[j])
        if b["low"]<=stop: r+=rem*((stop-entry)/risk); rem=0; break
        if not h1 and b["high"]>=t1: r+=(1/3)*2; rem-=1/3; h1=True
        if not h2 and b["high"]>=t2: r+=(1/3)*5; rem-=1/3; h2=True
    if rem>0: r+=rem*((bars[-1]["close"]-entry)/risk)
    return r

resolved=0
trades=[]
for tkr in universe:
    bars=engine.load(tkr)
    if not bars or len(bars)<40: continue
    resolved+=1
    ec=[b["close"] for b in bars]; e21=engine.ema(ec,21); e21low=engine.ema([b["low"] for b in bars],21); last=-10**9
    for i in range(30,len(bars)):
        b=bars[i]
        if not(WIN_START<=b["date"]<=WIN_END) or i-last<COOLDOWN: continue
        a14=engine.atr(bars,14,i)
        if e21[i] is None or a14 in (None,0) or not ema_rising(e21,i): continue
        if not(-0.5<=(b["close"]-e21[i])/a14<=0.5): continue
        t20=ec[i]/ec[i-20]-1 if i>=20 else None; q20=engine.qret(b["date"],20)
        rs=(t20-q20) if (t20 is not None and q20 is not None) else -9
        if not(RS_LO<=rs<=RS_HI): continue
        if sorted(x["close"]*(x["vol"] or 0) for x in bars[i-19:i+1])[10]<100e6: continue
        if not strong_regime(b["date"]): continue
        ssl=e21low[i]
        if ssl is None: continue
        entry=b["close"]; risk=entry-ssl
        if risk/entry<0.003: continue
        last=i; R=scaleout(bars,i,entry,risk,e21low)
        trades.append(dict(date=b["date"],R_net=R-FX/(risk/entry),R=R,q=engine.quarter(b["date"]),
                           inwatch=(tkr in set(watch))))
trades.sort(key=lambda x:x["date"])
print(f"resolved {resolved}/{len(universe)} names with data\n")

def ci(xs,it=8000):
    n=len(xs); m=[sum(xs[random.randrange(n)] for _ in range(n))/n for _ in range(it)]; m.sort()
    return m[int(.025*it)],m[int(.975*it)]
def report(name,ts):
    if not ts: print(name,"n=0"); return
    n=len(ts); xs=[t["R_net"] for t in ts]; win=sum(1 for t in ts if t["R"]>0)/n
    cut=int(n*0.70); tr,te=xs[:cut],xs[cut:]; lo,hi=ci(te)
    olo,ohi=ci(xs)  # full-sample CI too
    tot=sum(xs); conc=sum(sorted(xs,reverse=True)[:3])/tot if tot>0 else None
    x26=[t["R_net"] for t in ts if t["date"]>="2026-01-01"]
    q=defaultdict(list)
    for t in ts: q[t["q"]].append(t["R_net"])
    qpos=sum(1 for v in q.values() if sum(v)/len(v)>0)
    print(f"{name}:  n={n}  win={win*100:.1f}%  conc={round(conc,2) if conc else None}  reg+={qpos}/{len(q)}")
    print(f"   FULL {sum(xs)/n:+.3f}R CI[{olo:+.2f},{ohi:+.2f}] | TRAIN {sum(tr)/len(tr):+.3f} | OOS {sum(te)/len(te):+.3f}R (n={len(te)}) CI[{lo:+.2f},{hi:+.2f}]")
    print(f"   2026 n={len(x26)} {sum(x26)/len(x26):+.3f}R | byQ "+" ".join(f"{k}:{sum(v)/len(v):+.2f}" for k,v in sorted(q.items())))

report("BROAD universe (all signals)", trades)
report("  watchlist-only (anchor)", [t for t in trades if t["inwatch"]])
report("  NON-watchlist (names he doesnt trade)", [t for t in trades if not t["inwatch"]])
print("\nGoal: OOS>=+0.176R, win>=38%, positive all splits, conc<=0.60, n>=150. Significance = OOS CI lower bound > 0.")
