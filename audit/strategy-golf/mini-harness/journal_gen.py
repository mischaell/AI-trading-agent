#!/usr/bin/env python3
"""journal_gen.py — mobile trading journal for THE BOOK (2026-07-06).

Reads one_book.json + regime_states.json + bars, writes a self-contained,
phone-first HTML page to ~/mission-control/alex-forward-test/journal/index.html.
Served tailnet-only via `tailscale serve --https=8443`. Runs after every
book run (intraday + EOD). No JS, dark-mode aware, no external assets.
"""
import html, json, os, sys
from datetime import datetime

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
OUT_DIR = os.path.join(STATE_DIR, "journal")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

def risk_on_today():
    p = os.path.join(STATE_DIR, "regime_states.json")
    if not os.path.exists(p): return None, None
    states = json.load(open(p))
    d = sorted(states)[-1]
    return d, states[d]

def trail_now(p, last_close, atr):
    gain = (last_close - p["basis"]) / p["atr0"] if p["atr0"] else 0
    w = 3.0
    if gain > 12: w = 1.5
    elif gain > 6: w = 2.0
    _, state = risk_on_today()
    if state not in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION", None): w /= 2
    return p["peak"] - w * atr, w

def money(x): return f"${x:,.0f}"

def market_picture():
    """Alex's pf-update 'Market picture', from our computed data."""
    parts = []
    dp = os.path.join(STATE_DIR, "regime_detail.json")
    if os.path.exists(dp):
        d = json.load(open(dp))
        cls = "up" if d["state"] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION") else "down"
        parts.append(f"state <b class='{cls}'>{d['state']}</b> ({d['date']})")
        parts.append(f"MCO z {d['mco_z']:+.1f} · MCSI z {d['mcsi_z']:+.1f}")
    else:
        rd, rstate = risk_on_today()
        parts.append(f"state <b>{rstate or 'unknown'}</b> ({rd or '—'})")
    try:
        import confluence
        ok, detail = confluence.internals(datetime.now().strftime("%Y-%m-%d"))
        if ok is None:
            parts.append("internals: no data")
        else:
            cls = "up" if ok else "down"
            parts.append(f"internals (VIX/credit/defensive) <b class='{cls}'>"
                         f"{'risk on' if ok else 'risk off'}</b>" + ("" if ok else f" ({detail})"))
    except Exception:
        pass
    return ('<h2>Market picture</h2><div class="card"><div class="sub">'
            + " · ".join(parts) + "</div></div>")

def main():
    st = json.load(open(os.path.join(STATE_DIR, "one_book.json")))
    rd, rstate = risk_on_today()
    openp = [p for p in st["positions"] if p["status"] in ("open", "frozen")]
    closed = [p for p in st["positions"] if p["status"] == "closed"]
    cards, tot_val, tot_cost = [], 0.0, 0.0
    for p in sorted(openp, key=lambda x: x["opened"]):
        bars = engine.load(p["ticker"])
        if not bars: continue
        c = bars[-1]["close"]
        atr = engine.atr(bars, 14, len(bars) - 1) or p["atr0"]
        sh = sum(s for s, _ in p["lots"])
        cost = sum(s * px for s, px in p["lots"])
        val = sh * c
        tot_val += val; tot_cost += cost
        pnl = val - cost
        trail, w = trail_now(p, c, atr)
        dist = (c - trail) / c * 100
        cls = "up" if pnl >= 0 else "down"
        frozen = ' <span class="badge frz">FROZEN</span>' if p["status"] == "frozen" else ""
        stage = ["probe", "add 1", "add 2", "full"][min(p.get("stage", 0), 3)]
        cards.append(f"""
<div class="card">
 <div class="row"><b>{p['ticker']}</b>{frozen}<span class="badge">{stage}</span>
  <span class="{cls} big">{pnl:+,.0f}</span></div>
 <div class="row sub"><span>{sh:.1f} sh · basis {p['basis']:,.2f} · now {c:,.2f} ({bars[-1]['date']})</span></div>
 <div class="row sub"><span>value {money(val)} / cost {money(cost)} · <span class="{cls}">{(val/cost-1)*100:+.1f}%</span></span></div>
 <div class="row sub"><span>sell below <b>{trail:,.2f}</b> ({w:g}×ATR trail, {dist:.1f}% away)</span></div>
</div>""")
    closed_rows = "".join(
        f"<tr><td>{p['ticker']}</td><td>{p['opened']} → {p.get('closed','')}</td>"
        f"<td class=\"{'up' if p.get('pnl',0)>=0 else 'down'}\">{p.get('pnl',0):+,.0f}</td></tr>"
        for p in sorted(closed, key=lambda x: x.get("closed",""), reverse=True)[:30])
    events = "".join(f"<li><span class='sub'>{html.escape(e)}</span></li>"
                     for e in reversed(st.get("events", [])[-40:]))
    body = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<!-- generated {datetime.now().strftime('%Y-%m-%d %H:%M')} -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>THE BOOK</title>
<style>
:root {{ --bg:#fff; --fg:#111; --mut:#667; --card:#f4f5f7; --up:#0a7f3f; --dn:#c0392b; --bd:#e3e5e8; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#101215; --fg:#e8eaed; --mut:#9aa0a6; --card:#1a1d21; --up:#4cc38a; --dn:#ef6a5a; --bd:#2a2e33; }} }}
:root[data-theme="dark"] {{ --bg:#101215; --fg:#e8eaed; --mut:#9aa0a6; --card:#1a1d21; --up:#4cc38a; --dn:#ef6a5a; --bd:#2a2e33; }}
:root[data-theme="light"] {{ --bg:#fff; --fg:#111; --mut:#667; --card:#f4f5f7; --up:#0a7f3f; --dn:#c0392b; --bd:#e3e5e8; }}
body {{ background:var(--bg); color:var(--fg); font:16px/1.45 -apple-system,system-ui,sans-serif; margin:0; padding:14px; max-width:560px; margin-inline:auto; }}
h1 {{ font-size:19px; margin:4px 0 2px; }} h2 {{ font-size:14px; color:var(--mut); margin:20px 0 8px; text-transform:uppercase; letter-spacing:.04em; }}
.summary {{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; }}
.stat {{ background:var(--card); border-radius:12px; padding:10px 12px; }}
.stat .k {{ font-size:12px; color:var(--mut); }} .stat .v {{ font-size:20px; font-weight:650; }}
.card {{ background:var(--card); border-radius:12px; padding:10px 12px; margin:8px 0; }}
.row {{ display:flex; gap:8px; align-items:baseline; }} .row .big {{ margin-left:auto; font-size:18px; font-weight:650; }}
.sub {{ color:var(--mut); font-size:13px; }}
.badge {{ font-size:11px; background:var(--bd); border-radius:99px; padding:1px 8px; color:var(--mut); }}
.badge.frz {{ background:var(--dn); color:#fff; }}
.up {{ color:var(--up); }} .down {{ color:var(--dn); }}
table {{ width:100%; border-collapse:collapse; font-size:14px; }} td {{ padding:6px 4px; border-bottom:1px solid var(--bd); }}
ul {{ padding-left:0; list-style:none; margin:0; }} li {{ padding:5px 0; border-bottom:1px solid var(--bd); }}
footer {{ color:var(--mut); font-size:12px; margin:22px 0 8px; }}
</style>
</head><body>
<h1>THE BOOK — paper journal</h1>
{market_picture()}
<div class="summary">
 <div class="stat"><div class="k">open positions</div><div class="v">{len(openp)}</div></div>
 <div class="stat"><div class="k">deployed (cost)</div><div class="v">{money(tot_cost)}</div></div>
 <div class="stat"><div class="k">open P&amp;L</div><div class="v {'up' if tot_val-tot_cost>=0 else 'down'}">{tot_val-tot_cost:+,.0f}</div></div>
 <div class="stat"><div class="k">realized ({st.get('closed',0)} closed, {st.get('wins',0)} wins)</div><div class="v {'up' if st.get('realized',0)>=0 else 'down'}">{st.get('realized',0):+,.0f}</div></div>
</div>
<h2>Open positions</h2>
{''.join(cards) if cards else '<div class="sub">none</div>'}
<h2>Closed</h2>
<table>{closed_rows if closed_rows else '<tr><td class="sub">none yet</td></tr>'}</table>
<h2>Recent events</h2>
<ul>{events if events else '<li class="sub">none yet</li>'}</ul>
<footer>rules: $2.5k probe ($5k on winner-continuation) · adds on his calls in profit → $11k/$19k/$28k · 3×ATR trail, tightens with gain, halves in weak regime · sleeve full ⇒ WC entries only<br>
generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · paper only</footer>
</body></html>
"""
    os.makedirs(OUT_DIR, exist_ok=True)
    open(os.path.join(OUT_DIR, "index.html"), "w").write(body)
    print(f"journal: {len(openp)} open, {len(closed)} closed -> journal/index.html")

if __name__ == "__main__":
    main()
