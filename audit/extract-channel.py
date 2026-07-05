#!/usr/bin/env python3
"""Extract Alex's messages (prose + embed titles) from a saved discord_fetch
result file into a compact text file. Usage: extract-channel.py <file> <outname>"""
import json, sys, os
ALEX = "709210724987043932"
data = json.load(open(sys.argv[1])); body = data.get("body", data)
if isinstance(body, dict): body = body.get("messages", [])
os.makedirs("audit/text", exist_ok=True)
out = f"audit/text/{sys.argv[2]}.txt"
lines = []
for m in body:
    if m.get("author", {}).get("id") != ALEX: continue
    c = (m.get("content", "") or "").strip()
    for e in m.get("embeds", []):
        t, d = e.get("title", ""), e.get("description", "")
        if t or d: c += f"  [link: {t} — {d}]"
    if c: lines.append((m["timestamp"][:16], c))
lines.sort()
with open(out, "w") as f:
    for ts, c in lines: f.write(f"=== {ts} ===\n{c}\n\n")
print(f"{out}: {len(lines)} Alex msgs  {lines[0][0] if lines else '-'} -> {lines[-1][0] if lines else '-'}")
