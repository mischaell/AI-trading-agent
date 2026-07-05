#!/usr/bin/env python3
"""Pull Alex's newest equity-trades entry calls (Long + ADD formats, v2) from Discord (user token, same
mechanism as the discord_fetch MCP tool) and write the NEW ones to candidates.json
for the forward-test core. Dedupes via a seen-ids file in the state dir.

Reads token from ~/.openclaw/auth/.discord_user_token. Stdlib only.
Usage: python3 discord_pull.py            (writes <STATE_DIR>/candidates.json)
"""
import json, re, os, urllib.request

CHANNEL = "1026453297047015474"          # equity-trades
ALEX = "709210724987043932"              # author filter
TOKEN_PATH = os.path.expanduser("~/.openclaw/auth/.discord_user_token")
STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
SEEN = os.path.join(STATE_DIR, "seen_ids.json")
OUT = os.path.join(STATE_DIR, "candidates.json")
PAT = re.compile(r'\b(Long|ADD\w*)\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?S?SL\s*@\s*([\d.]+)', re.I | re.S)  # v2: Long + ADD entry formats

def fetch():
    token = open(TOKEN_PATH).read().strip()
    url = f"https://discord.com/api/v10/channels/{CHANNEL}/messages?limit=50"
    req = urllib.request.Request(url, headers={"Authorization": token, "User-Agent": "Mozilla/5.0"})
    return json.load(urllib.request.urlopen(req, timeout=30))

def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    seen = set(json.load(open(SEEN))) if os.path.exists(SEEN) else set()
    try:
        msgs = fetch()
    except Exception as e:
        print(f"discord_pull: fetch failed ({e}); writing empty candidates"); json.dump([], open(OUT, "w")); return
    cands = []
    for m in msgs:
        if m.get("author", {}).get("id") != ALEX or m["id"] in seen:
            continue
        h = PAT.search(m.get("content", "") or "")
        if h:
            cands.append(dict(id=m["id"], ticker=h[3].upper(), date=m["timestamp"][:10],
                              entry=float(h[4]), sl=float(h[5]),
                              fmt=h[1].upper()[:3], size_pct=float(h[2])))
        seen.add(m["id"])
    json.dump(sorted(seen), open(SEEN, "w"))
    json.dump(cands, open(OUT, "w"), indent=2)
    print(f"discord_pull: {len(msgs)} msgs scanned, {len(cands)} new entry calls -> {OUT}")

if __name__ == "__main__":
    main()
