#!/usr/bin/env python3
"""
Run a batch of PAE→constraints tests using pae_ratios.py.

- Reads a YAML manifest of cases
- Runs pae_ratios.py for each case
- Writes outputs under an --outdir/<case-name> folder:
    const.inp
    constraints.yaml (optional, if requested)
    pae.bin / pae.png / viz.png / viz.json (from helpers_viz)
    run.log  (captured stdout/stderr)
- Prints a summary at the end
"""

import argparse
import subprocess
import sys
import os
import time
import shutil
from typing import Dict, Any, List
import difflib

try:
    import yaml  # PyYAML (already used in repo)
except ImportError:
    print("Please `pip install pyyaml` to use this runner.", file=sys.stderr)
    sys.exit(1)


def _resolve_path(p: str, base: str) -> str:
    return p if os.path.isabs(p) else os.path.abspath(os.path.join(base, p))


def _read_text(p: str) -> str:
    with open(p, "r", encoding="utf-8", errors="replace") as f:
        return f.read().replace("\r\n", "\n").replace("\r", "\n")


def compare_to_gold(case_outdir: str, gold_root: str, case_name: str) -> dict:
    """Compare key artifacts against a gold directory.
    Returns a dict: { 'checked': bool, 'ok': bool, 'details': str }
    Writes unified diffs into the case outdir when mismatches occur.
    """
    result = {"checked": False, "ok": False, "details": ""}
    if not gold_root:
        return result
    gold_dir = os.path.join(gold_root, case_name)
    if not os.path.isdir(gold_dir):
        result["details"] = f"gold dir missing: {gold_dir}"
        return result

    checks = []
    overall_ok = True

    # Files to compare as text
    targets = [
        ("const.inp", "const.diff"),
        ("constraints.yaml", "constraints.diff"),
    ]

    for fname, diffname in targets:
        gold_p = os.path.join(gold_dir, fname)
        new_p = os.path.join(case_outdir, fname)
        if not os.path.exists(gold_p) and not os.path.exists(new_p):
            checks.append(f"{fname}: (both missing)")
            continue
        if not os.path.exists(gold_p):
            checks.append(f"{fname}: gold missing")
            overall_ok = False
            continue
        if not os.path.exists(new_p):
            checks.append(f"{fname}: new missing")
            overall_ok = False
            continue
        gold_txt = _read_text(gold_p)
        new_txt = _read_text(new_p)
        if gold_txt == new_txt:
            checks.append(f"{fname}: OK")
        else:
            overall_ok = False
            checks.append(f"{fname}: DIFF → {diffname}")
            diff = difflib.unified_diff(
                gold_txt.splitlines(True),
                new_txt.splitlines(True),
                fromfile=f"gold/{case_name}/{fname}",
                tofile=f"new/{case_name}/{fname}",
                lineterm="",
            )
            with open(os.path.join(case_outdir, diffname), "w", encoding="utf-8") as df:
                df.writelines(diff)

    result["checked"] = True
    result["ok"] = overall_ok
    result["details"] = "; ".join(checks)
    return result


PAE_SCRIPT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "tools", "python", "pae_ratios.py")
)


def ensure_dir(p: str):
    os.makedirs(p, exist_ok=True)
    return p


def validate_case(c: Dict[str, Any]) -> None:
    if "name" not in c:
        raise ValueError("case missing 'name'")
    if "pae" not in c:
        raise ValueError(f"{c.get('name','<noname>')}: missing 'pae'")
    if not (("pdb" in c) ^ ("crd" in c)):  # exactly one of pdb or crd
        raise ValueError(f"{c['name']}: specify exactly one of 'pdb' or 'crd'")
    for k in ("pae", "pdb", "crd"):
        if k in c and not os.path.exists(c[k]):
            raise ValueError(f"{c['name']}: path not found: {k}={c[k]}")


def build_cmd(
    case: Dict[str, Any], emit_constraints: bool, no_const: bool, args
) -> List[str]:
    cmd = [sys.executable, PAE_SCRIPT, case["pae"]]
    if "pdb" in case:
        cmd += ["--pdb_file", case["pdb"]]
    else:
        cmd += ["--crd_file", case["crd"]]

    def add_opt(flag: str, key: str):
        if key in case and case[key] is not None:
            cmd.extend([flag, str(case[key])])
        elif getattr(args, key, None) is not None:
            cmd.extend([flag, str(getattr(args, key))])

    # New clustering/graph options
    add_opt("--graph_sim", "graph_sim")
    add_opt("--sigma", "sigma")
    add_opt("--linear_T", "linear_T")
    add_opt("--knn", "knn")
    add_opt("--pae_cutoff", "pae_cutoff")
    add_opt("--min_seq_sep", "min_seq_sep")
    add_opt("--interchain_cutoff", "interchain_cutoff")
    add_opt("--leiden_resolution", "leiden_resolution")
    add_opt("--leiden_iters", "leiden_iters")
    add_opt("--plddt_cutoff", "plddt_cutoff")

    if emit_constraints:
        cmd += ["--emit-constraints", "constraints.yaml"]
    if no_const:
        cmd += ["--no-const"]
    return cmd


def run_case(
    case: Dict[str, Any],
    outdir: str,
    emit_constraints: bool,
    no_const: bool,
    args,
    gold_root: str | None = None,
) -> Dict[str, Any]:
    ensure_dir(outdir)
    start = time.time()
    # We run inside the case outdir so the script writes artifacts there
    cmd = build_cmd(case, emit_constraints, no_const, args)
    log_path = os.path.join(outdir, "run.log")
    with open(log_path, "w", encoding="utf-8") as logf:
        logf.write("CMD: " + " ".join(cmd) + "\n\n")
        proc = subprocess.Popen(
            cmd, cwd=outdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        for line in proc.stdout:  # stream to log
            logf.write(line)
        ret = proc.wait()
    dur = time.time() - start

    # Collect result file presence
    files = {
        "const_inp": os.path.exists(os.path.join(outdir, "const.inp")),
        "constraints_yaml": os.path.exists(os.path.join(outdir, "constraints.yaml")),
        "viz_json": os.path.exists(os.path.join(outdir, "viz.json")),
        "pae_bin": os.path.exists(os.path.join(outdir, "pae.bin")),
        "pae_png": os.path.exists(os.path.join(outdir, "pae.png")),
        "viz_png": os.path.exists(os.path.join(outdir, "viz.png")),
        "log": True,
    }
    gold = (
        compare_to_gold(outdir, gold_root, case["name"])
        if gold_root
        else {"checked": False, "ok": False, "details": ""}
    )
    return {
        "name": case["name"],
        "ret": ret,
        "duration": dur,
        "files": files,
        "outdir": outdir,
        "gold": gold,
    }


def summarize(results: List[Dict[str, Any]]) -> str:
    rows = []
    hdr = f"{'CASE':30}  {'RC':>3}  {'sec':>6}  const  yaml  viz.json  pae.bin  pae.png  viz.png  gold  outdir"
    rows.append(hdr)
    rows.append("-" * len(hdr))
    for r in results:
        f = r["files"]
        gold = r.get("gold", {})
        gold_cell = (
            "-" if not gold.get("checked") else ("OK" if gold.get("ok") else "DIFF")
        )
        rows.append(
            f"{r['name'][:30]:30}  {r['ret']:>3}  {r['duration']:6.1f}  "
            f"{'Y' if f['const_inp'] else '-':>5}  "
            f"{'Y' if f['constraints_yaml'] else '-':>4}  "
            f"{'Y' if f['viz_json'] else '-':>8}  "
            f"{'Y' if f['pae_bin'] else '-':>7}  "
            f"{'Y' if f['pae_png'] else '-':>7}  "
            f"{'Y' if f['viz_png'] else '-':>7}  "
            f"{gold_cell:>4}  "
            f"{r['outdir']}"
        )
    return "\n".join(rows)


def main():
    ap = argparse.ArgumentParser(
        description="Batch runner for pae_ratios.py over a YAML manifest."
    )
    ap.add_argument("manifest", help="Path to YAML listing test cases")
    ap.add_argument("--outdir", default="pae_batch_out", help="Root output dir")
    ap.add_argument(
        "--emit-constraints",
        action="store_true",
        help="Also write constraints.yaml for each case",
    )
    ap.add_argument("--no-const", action="store_true", help="Skip writing const.inp")
    ap.add_argument(
        "--clean", action="store_true", help="Wipe the --outdir before running"
    )
    ap.add_argument("--gold", help="Path to gold results root (per-case subfolders)")
    ap.add_argument(
        "--graph_sim",
        choices=["exp", "linear"],
        help="Similarity transform for PAE→weight",
    )
    ap.add_argument("--sigma", type=float, help="Sigma for exp kernel (Å)")
    ap.add_argument("--linear_T", type=float, help="T for linear kernel (Å)")
    ap.add_argument("--knn", type=int, help="k for k-NN sparsification (0 disables)")
    ap.add_argument(
        "--pae_cutoff", type=float, help="Edge kept only if PAE ≤ cutoff (Å)"
    )
    ap.add_argument(
        "--min_seq_sep", type=int, help="Require |i-j| ≥ this (0 to disable)"
    )
    ap.add_argument(
        "--interchain_cutoff",
        type=float,
        help="Cross-chain edges require PAE ≤ this (Å)",
    )
    ap.add_argument("--leiden_resolution", type=float, help="Leiden resolution γ")
    ap.add_argument("--leiden_iters", type=int, help="Leiden iterations")
    ap.add_argument(
        "--plddt_cutoff",
        type=float,
        help="pLDDT cutoff for accepting regions (use negative to disable)",
    )
    args = ap.parse_args()

    with open(args.manifest, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    manifest_dir = os.path.dirname(os.path.abspath(args.manifest))
    cases = data.get("cases", [])
    if not cases:
        print("No cases found in manifest.", file=sys.stderr)
        sys.exit(2)

    if args.clean and os.path.exists(args.outdir):
        shutil.rmtree(args.outdir)
    ensure_dir(args.outdir)

    results = []
    for c in cases:
        for key in ("pae", "pdb", "crd"):
            if key in c:
                c[key] = _resolve_path(c[key], manifest_dir)
        try:
            validate_case(c)
        except Exception as e:
            print(f"[SKIP] {c.get('name','<noname>')}: {e}", file=sys.stderr)
            continue
        case_dir = ensure_dir(os.path.join(args.outdir, c["name"]))
        res = run_case(
            c, case_dir, args.emit_constraints, args.no_const, args, args.gold
        )
        print(f"[{c['name']}] rc={res['ret']}  {res['duration']:.1f}s  -> {case_dir}")
        results.append(res)

    print("\n" + summarize(results))


if __name__ == "__main__":
    main()
