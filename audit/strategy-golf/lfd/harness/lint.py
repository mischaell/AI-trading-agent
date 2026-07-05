#!/usr/bin/env python3
"""lint.py — every fence in goal.md, as a machine check.

Mechanical violations (frozen files, caps, imports) are reported verbosely.
Eval-referencing violations (date/ticker literals) print only
'VOID: constraint violation' — details go to runs/lint-audit.log, not stdout,
so the lint cannot be used as an oracle for what the eval contains.
Exit 0 = clean, 1 = VOID.
"""
import ast, hashlib, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
LFD = os.path.dirname(HERE)
GOLF = os.path.dirname(LFD)
AUDIT = os.path.join(LFD, "runs", "lint-audit.log")

def audit(msg):
    os.makedirs(os.path.dirname(AUDIT), exist_ok=True)
    open(AUDIT, "a").write(f"{int(time.time())} {msg}\n")

def die_verbose(msg):
    audit(f"VOID(verbose): {msg}")
    print(f"VOID: {msg}"); sys.exit(1)

def die_silent(msg):
    audit(f"VOID(silent): {msg}")
    print("VOID: constraint violation"); sys.exit(1)

def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()

# 1 — frozen files unchanged (manifest authored at harness creation; the
#     manifest itself is in git — the verifier cross-checks git status)
manifest = json.load(open(os.path.join(LFD, ".frozen-manifest.json")))
for rel, want in manifest.items():
    p = os.path.join(GOLF, rel)
    if not os.path.exists(p): die_verbose(f"frozen file missing: {rel}")
    if sha(p) != want: die_verbose(f"frozen file modified: {rel}")

# 2 — lfd/ contains only sanctioned files (no side scripts)
ALLOWED = {"goal.md", "strategy_lfd.py", "engine_ext.py", "LOG.md", "FINAL.md",
           "score_dev.json", ".run_state.json", ".frozen-manifest.json",
           ".holdout_used", "harness", "runs", "__pycache__", ".DS_Store"}
extra = [f for f in os.listdir(LFD) if f not in ALLOWED]
if extra: die_verbose(f"unsanctioned files in lfd/: {extra}")

# 3 — strategy_lfd.py: one dict, <=10 keys, scalar values, clean strings
src = open(os.path.join(LFD, "strategy_lfd.py")).read()
tree = ast.parse(src)
assigns = [n for n in tree.body if isinstance(n, ast.Assign)]
others = [n for n in tree.body
          if not isinstance(n, ast.Assign)
          and not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))]
if len(assigns) != 1 or others:
    die_verbose("strategy_lfd.py must be exactly: optional docstring + one STRATEGY assignment")
a = assigns[0]
if len(a.targets) != 1 or getattr(a.targets[0], "id", "") != "STRATEGY":
    die_verbose("the single assignment must be to STRATEGY")

def const_val(node):
    if isinstance(node, ast.Constant): return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub) \
       and isinstance(node.operand, ast.Constant): return -node.operand.value
    return die_verbose("STRATEGY values must be literal scalars")

v = a.value
if isinstance(v, ast.Call) and getattr(v.func, "id", "") == "dict" and not v.args:
    items = {kw.arg: const_val(kw.value) for kw in v.keywords}
elif isinstance(v, ast.Dict):
    items = {const_val(k): const_val(val) for k, val in zip(v.keys, v.values)}
else:
    die_verbose("STRATEGY must be a plain dict(...) or {...} literal")

if len(items) > 10: die_verbose(f"STRATEGY has {len(items)} keys (max 10)")
if "fx_roundtrip_pct" in items: die_verbose("fx cost is frozen; remove the key")
for k, val in items.items():
    if not isinstance(val, (int, float, bool, str, type(None))):
        die_verbose(f"non-scalar value for {k}")
    if isinstance(val, str):
        if len(val) > 16 or not re.fullmatch(r"[a-z_][a-z0-9_]*", val):
            die_verbose(f"string value for {k} must be short lowercase identifier")
if re.search(r"2026|\d{4}-\d{2}", "".join(str(x) for x in items.values())):
    die_silent("date-like content in STRATEGY")

# 4 — engine_ext.py caps
ext_path = os.path.join(LFD, "engine_ext.py")
ext_src = open(ext_path).read()
ext_tree = ast.parse(ext_src)
doc_end = 0
if (ext_tree.body and isinstance(ext_tree.body[0], ast.Expr)
        and isinstance(ext_tree.body[0].value, ast.Constant)):
    doc_end = ext_tree.body[0].end_lineno
ext_code = "\n".join(ext_src.splitlines()[doc_end:])   # text checks skip the docstring
code_lines = [l for l in ext_code.splitlines() if l.strip()]
if len(code_lines) > 120:
    die_verbose(f"engine_ext.py has {len(code_lines)} code lines (max 120)")

OK_FROM_ENGINE = {"ema", "atr", "strong_regime", "qret"}
for n in ast.walk(ext_tree):
    if isinstance(n, ast.Import):
        for al in n.names:
            if al.name not in ("math", "statistics"):
                die_verbose(f"banned import: {al.name}")
    if isinstance(n, ast.ImportFrom):
        if n.module != "engine" or any(al.name not in OK_FROM_ENGINE for al in n.names):
            die_verbose(f"banned import-from: {n.module}")
if re.search(r"\b(open|exec|eval|__import__|compile|getattr|globals|vars)\s*\(", ext_code):
    die_verbose("banned call in engine_ext.py")
if re.search(r"\b(os|sys|json|urllib|subprocess|socket|pathlib|importlib|shutil|pickle)\b",
             ext_code):
    die_verbose("banned module reference in engine_ext.py")
if "load_calls" in ext_code:
    die_verbose("engine_ext.py may not touch the call list")
for n in ast.walk(ext_tree):
    if isinstance(n, ast.Constant) and isinstance(n.value, str):
        if re.search(r"\d{4}-\d{2}|2026", n.value) or re.fullmatch(r"[A-Z]{2,6}", n.value):
            die_silent("eval-referencing literal in engine_ext.py")

print("lint: clean")
