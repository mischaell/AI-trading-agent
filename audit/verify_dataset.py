#!/usr/bin/env python3
"""verify_dataset.py — the verification lever (2026-07-05).

Runs the full audit battery over everything downstream analyses depend on and
writes audit/dataset-stamp.json. Analysis scripts call stamp.require_stamp()
and REFUSE to run without a fresh PASS/WARN stamp. Also (re)generates
audit/alex-stated-performance.json — the canonical ground-truth series, the
ONLY permitted source for any "Alex" column.

Audits:
  A entry-range   every call's posted entry inside its entry-day bar range
                  (+/-15%) -> catches split-adjustment corruption; failing
                  tickers land on the exclusion list inside the stamp
  B arithmetic    posted Closed P&L% vs (posted exit price / posted entry - 1)
                  where both known -> catches fabricated/garbled exits
  C edited-msgs   Discord edited_timestamp scan over all saved raw pages ->
                  were his calls edited after posting?
  D completeness  pf-update daily books vs the call feed (ticker overlap)
  E stated-series YTD compounding coherence of his monthly reports
"""
import glob, hashlib, json, os, re
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, "audit")
GOLF = os.path.join(AUD, "strategy-golf")
RAW_PAGES = os.path.expanduser(
    "~/.claude/projects/-Users-michaelstephanblome/*/tool-results/mcp-claude_ai_Headless_Fetch-discord_fetch-*.txt")

import sys
sys.path.insert(0, GOLF)
import engine

def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()[:16]

def audit_A():
    calls = json.load(open(os.path.join(GOLF, "calls_v2.json")))
    ok, bad, nobars = [], [], []
    for d, tkr, e, sl, fmt, size in calls:
        bars = engine.load(tkr)
        if not bars:
            nobars.append(tkr); continue
        b = next((x for x in bars if x["date"] >= d), None)
        if b is None:
            nobars.append(tkr); continue
        (ok if b["low"] * 0.85 <= e <= b["high"] * 1.15 else bad).append((d, tkr, e, b["close"]))
    excl = sorted({t for _, t, _, _ in bad})
    return dict(total=len(calls), in_range=len(ok), out_of_range=len(bad),
                no_bars=len(set(nobars)), excluded_tickers=excl)

def audit_B():
    calls = {(c[0], c[1]): c[2] for c in json.load(open(os.path.join(GOLF, "calls_v2.json")))}
    n = agree = 0; worst = []
    for l in open(os.path.join(AUD, "exits.jsonl")):
        r = json.loads(l)
        if r["action"] != "Closed" or not r["tranche_date"] or r["pnl_pct"] is None or not r["price"]:
            continue
        e = calls.get((r["tranche_date"], r["ticker"]))
        if not e: continue
        implied = (r["price"] / e - 1) * 100
        n += 1
        diff = abs(implied - r["pnl_pct"])
        if diff <= 3.0: agree += 1
        else: worst.append((r["ticker"], r["tranche_date"], r["pnl_pct"], round(implied, 1)))
    worst.sort(key=lambda w: -abs(w[2] - w[3]))
    return dict(checked=n, within_3pts=agree, agree_rate=round(agree / n, 3) if n else None,
                note="disagreements are mostly trim-basis accounting, see worst",
                worst=worst[:5])

def audit_C():
    edited = []; scanned = 0
    for path in glob.glob(RAW_PAGES):
        try:
            body = json.load(open(path)).get("body")
        except (ValueError, OSError):
            continue
        if not isinstance(body, list): continue
        for m in body:
            if not isinstance(m, dict) or "id" not in m: continue
            scanned += 1
            if m.get("edited_timestamp"):
                c = (m.get("content") or "")[:60].replace("\n", " ")
                edited.append((m["timestamp"][:10], m["edited_timestamp"][:10], c))
    # export file uses DiscordChatExporter format
    exp = os.path.join(ROOT, "data", "discord-exports", "equity-trades.json")
    for m in json.load(open(exp))["messages"]:
        scanned += 1
        if m.get("timestampEdited"):
            edited.append((m["timestamp"][:10], m["timestampEdited"][:10],
                           (m.get("content") or "")[:60].replace("\n", " ")))
    return dict(messages_scanned=scanned, edited=len(edited), examples=edited[:8])

def audit_D():
    call_tkrs = {c[1] for c in json.load(open(os.path.join(GOLF, "calls_v2.json")))
                 if c[0] >= "2024-09-01"}
    pf_tkrs = set()
    pat = re.compile(r'\b([A-Z]{2,6})\b')
    for l in open(os.path.join(AUD, "pf-update-raw.jsonl")):
        m = json.loads(l)
        for line in m["content"].splitlines():
            if re.match(r'\s*(NEW|ADDED|OUT|TRIMMED)\b', line):
                for t in pat.findall(line):
                    if t not in ("NEW", "ADDED", "OUT", "TRIMMED", "AT", "R", "SL", "EC", "PF"):
                        pf_tkrs.add(t)
    only_pf = sorted(pf_tkrs - call_tkrs)
    return dict(pf_book_tickers=len(pf_tkrs), also_in_call_feed=len(pf_tkrs & call_tkrs),
                in_book_never_called=len(only_pf), examples_never_called=only_pf[:10])

def stated_series():
    msgs = sorted((json.loads(l) for l in open(os.path.join(AUD, "pf-update-raw.jsonl"))),
                  key=lambda m: m["timestamp"])
    mon = re.compile(r'Monthly\s*\(?\s*([+-]?\s*\d+(?:\.\d+)?)\s*%', re.I)
    ytd = re.compile(r'YTD\s*\(?\s*([+-]?\s*\d+(?:\.\d+)?)\s*%', re.I)
    out = []
    for m in msgs:
        hm, hy = mon.search(m["content"]), ytd.search(m["content"])
        if hm or hy:
            out.append(dict(posted=m["timestamp"][:10],
                            monthly=float(hm[1].replace(" ", "")) if hm else None,
                            ytd=float(hy[1].replace(" ", "")) if hy else None,
                            source_msg_id=m["id"]))
    json.dump(dict(definition="GROUND TRUTH: Alex's stated numbers, verbatim from pf-update monthly posts",
                   pulled=datetime.now().strftime("%Y-%m-%d"), series=out),
              open(os.path.join(AUD, "alex-stated-performance.json"), "w"), indent=2)
    return out

def covered_year(posted):
    # a monthly report posted in the first days of January covers the PRIOR year
    dt = datetime.strptime(posted, "%Y-%m-%d")
    return dt.year - 1 if (dt.month == 1 and dt.day <= 10) else dt.year

def audit_E(series):
    # coherence: YTD steps within one covered year imply monthly returns +/-40%
    incoherent = []
    prev = None
    for s in series:
        if s["ytd"] is None: continue
        if prev is not None and covered_year(prev["posted"]) == covered_year(s["posted"]):
            step = (1 + s["ytd"] / 100) / (1 + prev["ytd"] / 100) - 1
            if abs(step) > 0.40:
                incoherent.append((prev["posted"], s["posted"], round(step * 100, 1)))
        prev = s
    return dict(points=len([s for s in series if s["ytd"] is not None]),
                implausible_steps=incoherent)

def main():
    series = stated_series()
    stamp = dict(
        created=datetime.now().strftime("%Y-%m-%d %H:%M"),
        inputs={f: sha(os.path.join(AUD, f) if not f.startswith("sg/") else os.path.join(GOLF, f[3:]))
                for f in ("sg/calls_v2.json", "exits.jsonl", "pf-update-raw.jsonl")},
        A_entry_range=audit_A(), B_arithmetic=audit_B(),
        C_edited_messages=audit_C(), D_completeness=audit_D(),
        E_stated_series=audit_E(series))
    fails = []
    if stamp["A_entry_range"]["out_of_range"] > 0.1 * stamp["A_entry_range"]["total"]:
        fails.append("A: >10% of calls out of bar range")
    if (stamp["B_arithmetic"]["agree_rate"] or 0) < 0.6:
        fails.append("B: arithmetic agreement <60%")
    if stamp["E_stated_series"]["implausible_steps"]:
        fails.append("E: implausible YTD steps")
    stamp["verdict"] = "FAIL" if fails else ("WARN" if stamp["C_edited_messages"]["edited"] else "PASS")
    stamp["fail_reasons"] = fails
    json.dump(stamp, open(os.path.join(AUD, "dataset-stamp.json"), "w"), indent=2)
    print(json.dumps(stamp, indent=1)[:3000])
    print(f"\nVERDICT: {stamp['verdict']}  -> audit/dataset-stamp.json + audit/alex-stated-performance.json")

if __name__ == "__main__":
    main()
