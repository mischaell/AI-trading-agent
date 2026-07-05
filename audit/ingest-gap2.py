#!/usr/bin/env python3
"""ingest-gap2.py — v2 extractor: captures BOTH entry-call formats
('Long X% TKR @ ... SL @ ...' and 'ADD X% TKR @ ... SSL @ ...') from a saved
discord_fetch result. Appends unique to audit/gap-entries-v2.jsonl with a
format tag. Prints the pagination cursor. Usage: ingest-gap2.py <file>"""
import json, re, sys, os

PAT = re.compile(r'\b(Long|ADD\w*)\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?S?SL\s*@\s*([\d.]+)', re.I | re.S)
OUT = "audit/gap-entries-v2.jsonl"

data = json.load(open(sys.argv[1]))
body = data.get("body", data)
if isinstance(body, dict): body = body.get("messages", [])

seen = {json.loads(l)["id"] for l in open(OUT)} if os.path.exists(OUT) else set()
ids, tss, added = [], [], 0
with open(OUT, "a") as f:
    for m in body:
        if "id" not in m: continue
        ids.append(int(m["id"])); tss.append(m["timestamp"])
        h = PAT.search(m.get("content", "") or "")
        if h and m["id"] not in seen:
            f.write(json.dumps({"id": m["id"], "timestamp": m["timestamp"],
                                "content": m["content"], "fmt": h[1].upper()}) + "\n")
            added += 1
print(f"msgs={len(ids)} added={added} cursor(before)={min(ids)} span={min(tss)[:10]}..{max(tss)[:10]}")
