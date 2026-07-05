"""stamp.py — analysis scripts call require_stamp() and refuse to run unless
audit/verify_dataset.py has produced a fresh, non-FAIL dataset stamp."""
import json, os, sys
from datetime import datetime

def require_stamp(max_age_days=7):
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset-stamp.json")
    if not os.path.exists(p):
        sys.exit("REFUSED: no dataset stamp. Run: python3 audit/verify_dataset.py")
    s = json.load(open(p))
    age = (datetime.now() - datetime.strptime(s["created"], "%Y-%m-%d %H:%M")).days
    if s["verdict"] == "FAIL":
        sys.exit(f"REFUSED: dataset stamp is FAIL ({s['fail_reasons']}). Fix data first.")
    if age > max_age_days:
        sys.exit(f"REFUSED: dataset stamp is {age}d old (max {max_age_days}). Re-run verify_dataset.py")
    return s

def excluded_tickers():
    return set(require_stamp()["A_entry_range"]["excluded_tickers"])
