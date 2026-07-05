#!/usr/bin/env python3
"""Extract Long-entry calls from a saved discord_fetch result file (processed on
disk so the verbose payload never enters the model context). Appends unique
calls to audit/gap-equity-trades.jsonl and prints the cursor for the next page.
Usage: python3 audit/ingest-gap.py <saved_result_file>"""
import json, re, sys, os
LCALL = re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)', re.I | re.S)
OUT = "audit/gap-equity-trades.jsonl"

data = json.load(open(sys.argv[1]))
body = data.get("body", data)
if isinstance(body, dict):
    body = body.get("messages", [])

seen = set()
if os.path.exists(OUT):
    seen = {json.loads(l)["id"] for l in open(OUT)}

ids, tss, calls, added = [], [], 0, 0
with open(OUT, "a") as f:
    for m in body:
        if "id" not in m:
            continue
        ids.append(int(m["id"])); tss.append(m["timestamp"])
        if LCALL.search(m.get("content", "") or ""):
            calls += 1
            if m["id"] not in seen:
                f.write(json.dumps({"id": m["id"], "timestamp": m["timestamp"], "content": m["content"]}) + "\n")
                added += 1
print(f"page: msgs={len(ids)} longcalls={calls} added={added}")
if ids:
    print(f"oldest_id(before cursor)={min(ids)}  min_ts={min(tss)[:19]}  max_ts={max(tss)[:19]}")
print(f"total calls in {OUT}: {sum(1 for _ in open(OUT))}")
