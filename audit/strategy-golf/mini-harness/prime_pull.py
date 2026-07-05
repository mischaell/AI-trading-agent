#!/usr/bin/env python3
"""prime_pull.py — fetch Alex's latest 5-pillar checklist from prime-report.

Finds the newest message containing 'THE MARKET PICTURE (5-pillars checklist)'
and parses each pillar's verdict (risk-on / risk-off / mixed / free text).
Writes prime_pillars.json (ground truth: HIS stated reads, verbatim verdicts).
Stdlib only; same user-token mechanism as discord_pull.
"""
import json, os, re, urllib.request

CHANNEL = "1082100049422598215"          # prime-report
ALEX = "709210724987043932"
TOKEN_PATH = os.path.expanduser("~/.openclaw/auth/.discord_user_token")
STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
OUT = os.path.join(STATE_DIR, "prime_pillars.json")

PILLAR = re.compile(r'\*\*(\d)\.\s*(.+?)\s*[—–-]+\s*(.+?)\*\*')
TITLE = re.compile(r'(?:SITUATIONAL AWARENESS.*?|GAMEPLAN.*?)(\d{1,2}/\d{1,2})')

def fetch():
    token = open(TOKEN_PATH).read().strip()
    url = f"https://discord.com/api/v10/channels/{CHANNEL}/messages?limit=15"
    req = urllib.request.Request(url, headers={"Authorization": token, "User-Agent": "Mozilla/5.0"})
    return json.load(urllib.request.urlopen(req, timeout=30))

def main():
    try:
        msgs = fetch()
    except Exception as e:
        print(f"prime_pull: fetch failed ({e}); keeping previous pillars")
        return
    for m in sorted(msgs, key=lambda x: x["timestamp"], reverse=True):
        if m.get("author", {}).get("id") != ALEX: continue
        c = m.get("content", "") or ""
        if "5-pillars checklist" not in c: continue
        pillars = [dict(n=int(h[1]), name=h[2].replace("$", ""), verdict=h[3].strip())
                   for h in PILLAR.finditer(c)]
        if not pillars: continue
        t = TITLE.search(c)
        json.dump(dict(report=t[1] if t else None, msg_date=m["timestamp"][:10],
                       pillars=pillars), open(OUT, "w"), indent=2)
        print(f"prime_pull: pillars {[p['verdict'] for p in pillars]} "
              f"(report {t[1] if t else '?'}, posted {m['timestamp'][:10]})")
        return
    print("prime_pull: no 5-pillar message in the last 15; keeping previous")

if __name__ == "__main__":
    main()
