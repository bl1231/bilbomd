#!/usr/bin/env python3
"""
Run MultiFoXS on a list of FoXS .dat files produced earlier in the pipeline.

Defaults assume the sbatch step has `cd`'d into `/bilbomd/work/multifoxs`.
Paths may be overridden via CLI flags. Example usage from an interactive shell:

    python run-multifoxs.py \
        --foxs-list ../openmm/md/foxs_dat_files.txt \
        --prefix ../openmm/md \
        --saxs-data ../saxs-data.dat \
        --out-list ./foxs_dat_files_for_multifoxs.txt \
        --log ./multi_foxs.log

Any arguments after `--` are passed directly to `multi_foxs`.
"""

from __future__ import annotations

import argparse
import sys
import subprocess
from pathlib import Path
from typing import List


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Prepare MultiFoXS input and run it.")
    p.add_argument(
        "--foxs-list",
        default="../openmm/md/foxs_dat_files.txt",
        help="Path to the text file listing FoXS .dat basenames or relative paths (default: ../openmm/md/foxs_dat_files.txt)",
    )
    p.add_argument(
        "--prefix",
        default="../openmm/md",
        help="Directory to prefix to each entry in --foxs-list when constructing full paths (default: ../openmm/md)",
    )
    p.add_argument(
        "--saxs-data",
        default="../saxs-data.dat",
        help="Output SAXS data file path for MultiFoXS -o (was hardcoded before).",
    )
    p.add_argument(
        "--out-list",
        default="./foxs_dat_files_for_multifoxs.txt",
        help="Path to write the resolved list of FoXS .dat files for MultiFoXS.",
    )
    p.add_argument(
        "--log",
        default="./multi_foxs.log",
        help="Path to capture MultiFoXS stdout/stderr.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Only prepare the list file; do not invoke MultiFoXS.",
    )
    p.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Print extra progress information.",
    )
    # Pass-through args to multi_foxs after "--"
    p.add_argument(
        "extra",
        nargs=argparse.REMAINDER,
        help="Additional args to pass to multi_foxs (place them after --).",
    )
    return p


def read_foxs_entries(list_path: Path) -> List[str]:
    if not list_path.exists():
        raise FileNotFoundError(f"FoXS list not found: {list_path}")
    entries: List[str] = []
    with list_path.open("r", encoding="utf-8") as f:
        for raw in f:
            s = raw.strip()
            if not s:
                continue
            # tolerate comments
            if s.startswith("#"):
                continue
            entries.append(s)
    if not entries:
        raise ValueError(f"No entries found in {list_path}")
    return entries


def resolve_paths(entries: List[str], prefix_dir: Path) -> List[Path]:
    resolved: List[Path] = []
    for e in entries:
        p = Path(e)
        if not p.is_absolute():
            p = (prefix_dir / e).resolve()
        else:
            p = p.resolve()
        resolved.append(p)
    return resolved


def write_out_list(paths: List[Path], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for p in paths:
            f.write(str(p) + "\n")


def ensure_files_exist(paths: List[Path]) -> None:
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(
            "Some FoXS .dat files are missing:\n" + "\n".join(missing)
        )


def main(argv: List[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    foxs_list = Path(args.foxs_list)
    prefix_dir = Path(args.prefix)
    saxs_output = Path(args.saxs_data)
    out_list = Path(args.out_list)
    log_path = Path(args.log)

    if args.verbose:
        print(f"[multifoxs] CWD: {Path.cwd()}")
        print(f"[multifoxs] Using FoXS list: {foxs_list}")
        print(f"[multifoxs] Prefix dir: {prefix_dir}")
        print(f"[multifoxs] Output SAXS file (-o): {saxs_output}")
        print(f"[multifoxs] Resolved list will be written to: {out_list}")
        print(f"[multifoxs] Log file: {log_path}")

    entries = read_foxs_entries(foxs_list)
    resolved_paths = resolve_paths(entries, prefix_dir)
    ensure_files_exist(resolved_paths)
    write_out_list(resolved_paths, out_list)

    if args.dry_run:
        if args.verbose:
            print(
                "[multifoxs] Dry run: prepared list file but will not execute multi_foxs."
            )
        return 0

    cmd = ["multi_foxs"]
    # Any extra args after "--" go before the list file to avoid being treated as a filename.
    extra = []
    if args.extra:
        # argparse.REMAINDER keeps the leading "--"; drop it if present.
        extra = [e for e in args.extra if e != "--"]
    cmd += extra + ["-o", str(saxs_output), str(out_list)]

    if args.verbose:
        print("[multifoxs] Running:", " ".join(cmd))

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8") as log:
        # Use check=True to raise on non-zero exit; let sbatch trap the error code.
        proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
    return proc.returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        # Make failures visible in the pod logs and propagate a non-zero exit.
        print(f"[multifoxs] ERROR: {e}", file=sys.stderr)
        sys.exit(1)
