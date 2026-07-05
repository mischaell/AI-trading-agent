#!/usr/bin/env python3
"""ingest-pf.py — save COMPLETE pf-update messages (no filtering at capture)
from a saved discord_fetch page to audit/pf-update-raw.jsonl, dedup by id.
Usage: ingest-pf.py <saved_page.json>   Prints cursor + span."""
import json, os, sys

OUT = "audit/pf-update-raw.jsonl"
data = json.load(open(sys.argv[1]))
body = data.get("body", data)
seen = {json.loads(l)["id"] for l in open(OUT)} if os.path.exists(OUT) else set()
ids, tss, added = [], [], 0
with open(OUT, "a") as f:
    for m in body:
        if "id" not in m: continue
        ids.append(int(m["id"])); tss.append(m["timestamp"])
        if m["id"] in seen: continue
        f.write(json.dumps({"id": m["id"], "timestamp": m["timestamp"],
                            "author": m.get("author", {}).get("id"),
                            "content": m.get("content", "")}) + "\n")
        added += 1
print(f"msgs={len(ids)} added={added} cursor={min(ids)} span={min(tss)[:10]}..{max(tss)[:10]}")
