#!/usr/bin/env python3
"""parse-exits.py — extract Alex's exit/management messages (Trimmed/Closed)
into audit/exits.jsonl. His actual management record, timestamped — the ground
truth our simulated exits approximate.

Formats across eras (all handled):
  2024:   'Trimmed 1/3 NVDA @ 4.4R' | 'Closed RKLB @ 28.19' | 'Closed DDOG'
  2025:   'Closed SE @ 5.6% (126.78)'
  2025H2+ tranche-dated: 'Trimmed 1/3 PLTR (7/16) @ 2.9% (364.48) - 2R'
          'Closed NBIS (6/29) @ -1.1% (231.49)'  (several per message)

Record: {msg_date, action, frac, ticker, tranche_date|null, pnl_pct|null,
         price|null, r_mult|null}
Sources: full export + saved discord_fetch page files passed as argv.
Usage: python3 audit/parse-exits.py [raw_page.json ...]
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "audit", "exits.jsonl")

NUM = r'-?\d+(?:\.\d+)?'
PAT = re.compile(
    r'\b(Trimmed|Closed)\s+(?:(\d+/\d+)\s+)?([A-Z]{1,6})\b'      # action, frac?, ticker
    r'(?:\s*\((\d{1,2}/\d{1,2})\))?'                              # (m/d) tranche?
    rf'(?:\s*@\s*({NUM})\s*(%|R)?)?'                              # @ value unit?
    rf'(?:\s*\(({NUM})\))?'                                       # (price)?
    rf'(?:\s*-\s*({NUM})\s*R)?',                                  # trailing '- 2R'?
    re.I)

def tranche_year(md, msg_date):
    m = int(md.split("/")[0])
    y = int(msg_date[:4])
    return f"{y-1 if m > int(msg_date[5:7]) else y}-{m:02d}-{int(md.split('/')[1]):02d}"

def parse(ts, content, out):
    for h in PAT.finditer(content or ""):
        action, frac, tkr, md, val, unit, paren, rtag = h.groups()
        if tkr.upper() in ("AT", "TO", "OF", "THE", "IT", "ALL", "MY", "OUT", "ON", "IN", "FOR", "AND"): continue
        rec = dict(msg_date=ts[:10], action=action.title(), frac=frac,
                   ticker=tkr.upper(), tranche_date=tranche_year(md, ts[:10]) if md else None,
                   pnl_pct=None, price=None, r_mult=None)
        if val is not None:
            v = float(val)
            if unit == "%": rec["pnl_pct"] = v; rec["price"] = float(paren) if paren else None
            elif unit and unit.upper() == "R": rec["r_mult"] = v
            else: rec["price"] = v
        elif paren:
            rec["price"] = float(paren)
        if rtag: rec["r_mult"] = float(rtag)
        out.append(rec)

def main():
    out = []
    exp = json.load(open(os.path.join(ROOT, "data", "discord-exports", "equity-trades.json")))["messages"]
    for m in exp:
        parse(m["timestamp"], m.get("content", ""), out)
    for path in sys.argv[1:]:
        body = json.load(open(path)).get("body", [])
        for m in body:
            parse(m["timestamp"], m.get("content", ""), out)
    seen, uniq = set(), []
    for r in out:
        k = (r["msg_date"], r["action"], r["ticker"], r["tranche_date"], r["pnl_pct"], r["price"], r["frac"])
        if k in seen: continue
        seen.add(k); uniq.append(r)
    uniq.sort(key=lambda r: r["msg_date"])
    with open(OUT, "w") as f:
        for r in uniq: f.write(json.dumps(r) + "\n")
    from collections import Counter
    print(f"{len(uniq)} exit records -> {OUT}")
    print("by action:", dict(Counter(r["action"] for r in uniq)))
    print("with tranche date:", sum(1 for r in uniq if r["tranche_date"]),
          "| with pnl%:", sum(1 for r in uniq if r["pnl_pct"] is not None),
          "| with R:", sum(1 for r in uniq if r["r_mult"] is not None))

if __name__ == "__main__":
    main()
