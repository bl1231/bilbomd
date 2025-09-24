#!/usr/bin/env python3
"""
Run FoXS over PDBs in openmm/md/rg_* directories.

- For each rg_* directory:
  - Runs: foxs -p <file.pdb>
  - Appends stdout to   <dir>/foxs.log
  - Appends stderr to   <dir>/foxs_error.log
  - On success, appends relative path to <dir>/foxs_dat_files.txt
- Also writes a global manifest at <root>/foxs_dat_files.txt listing all .dat files
  relative to --relative-to (defaults to <root>).

Requirements:
- 'foxs' available on PATH (or pass --foxs-cmd)
"""

from __future__ import annotations
import argparse
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import sys
import threading


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run FoXS on PDBs under openmm/md/rg_*")
    p.add_argument(
        "--root",
        default="openmm/md",
        type=Path,
        help="Root directory containing rg_* subdirs (default: openmm/md)",
    )
    p.add_argument(
        "--pattern", default="rg_*", help="Subdirectory glob pattern (default: rg_*)"
    )
    p.add_argument(
        "--foxs-cmd",
        default="foxs",
        help="FoXS command/executable name (default: foxs)",
    )
    # Prefer SLURM-provided CPU count on the node when available
    slurm_cpus_env = os.environ.get("SLURM_CPUS_ON_NODE", "")
    try:
        slurm_cpus = int(slurm_cpus_env) if slurm_cpus_env else None
    except ValueError:
        slurm_cpus = None
    default_workers = slurm_cpus or (os.cpu_count() or 4)
    p.add_argument(
        "--workers",
        type=int,
        default=default_workers,
        help=(
            "Max parallel workers (default: SLURM_CPUS_ON_NODE if set, "
            "otherwise the machine CPU count)"
        ),
    )
    p.add_argument(
        "--relative-to",
        type=Path,
        default=None,
        help="Base path to make .dat paths relative to (default: --root)",
    )
    p.add_argument(
        "--global-manifest",
        default="foxs_dat_files.txt",
        help="Global manifest filename written under --root (default: foxs_dat_files.txt)",
    )
    return p.parse_args()


# Thread-safe append helpers
_write_locks: dict[Path, threading.Lock] = {}
_global_lock = threading.Lock()


def get_lock(path: Path) -> threading.Lock:
    with _global_lock:
        lock = _write_locks.get(path)
        if lock is None:
            lock = threading.Lock()
            _write_locks[path] = lock
        return lock


def append_line(path: Path, line: str) -> None:
    lock = get_lock(path)
    with lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(line.rstrip() + "\n")


def run_foxs_on_pdb(
    pdb_path: Path,
    foxs_cmd: str,
    per_dir_log: Path,
    per_dir_err: Path,
    per_dir_manifest: Path,
    global_manifest: Path,
    rel_base: Path,
) -> tuple[Path, int]:
    """Run FoXS on one PDB; return (pdb_path, returncode)."""
    workdir = pdb_path.parent
    # Open in append mode so multiple runs aggregate logs
    with per_dir_log.open("a", encoding="utf-8") as out_f, per_dir_err.open(
        "a", encoding="utf-8"
    ) as err_f:
        try:
            proc = subprocess.run(
                [foxs_cmd, "-p", pdb_path.name],
                cwd=workdir,
                stdout=out_f,
                stderr=err_f,
                check=False,
            )
        except FileNotFoundError:
            # FoXS not found
            append_line(per_dir_err, f"[ERROR] FoXS command not found: {foxs_cmd}")
            return (pdb_path, 127)

    rc = proc.returncode
    if rc == 0:
        # FoXS success: record the .dat path
        dat_name = pdb_path.name + ".dat"  # matches bash: "{}.dat"
        dat_path = workdir / dat_name
        # Relative path for manifests
        rel_path = dat_path.resolve().relative_to(rel_base.resolve())
        append_line(per_dir_manifest, str(rel_path))
        append_line(global_manifest, str(rel_path))
    else:
        append_line(per_dir_err, f"[ERROR] foxs failed (rc={rc}) for {pdb_path.name}")

    return (pdb_path, rc)


def main() -> int:
    args = parse_args()
    root: Path = args.root
    rel_base: Path = args.relative_to or root
    global_manifest = root / args.global_manifest

    if not root.is_dir():
        print(f"[ERROR] Root directory does not exist: {root}", file=sys.stderr)
        return 2

    # Clear previous global manifest if present (start fresh)
    if global_manifest.exists():
        global_manifest.unlink()

    # Collect rg_* directories
    rg_dirs = sorted([d for d in root.glob(args.pattern) if d.is_dir()])
    if not rg_dirs:
        print(f"[WARN] No directories matching {args.pattern} under {root}")
        return 0

    print("Run FoXS...")
    print(f"Found {len(rg_dirs)} directories.")

    futures = []
    total_pdbs = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for rgdir in rg_dirs:
            # Per-directory artifacts
            per_dir_log = rgdir / "foxs.log"
            per_dir_err = rgdir / "foxs_error.log"
            per_dir_manifest = rgdir / "foxs_dat_files.txt"

            # Clean per-dir manifest (keep logs appended)
            if per_dir_manifest.exists():
                per_dir_manifest.unlink()


            # Only process files matching 'md_\d+.pdb'
            import re
            pdbs = sorted([
                f for f in rgdir.glob("*.pdb")
                if re.match(r"md_\d+\.pdb$", f.name)
            ])
            if not pdbs:
                append_line(
                    per_dir_err, "[WARN] No matching .pdb files found in this directory."
                )
                continue

            print(f"- Processing {rgdir} ({len(pdbs)} PDBs)")
            total_pdbs += len(pdbs)

            for pdb in pdbs:
                futures.append(
                    pool.submit(
                        run_foxs_on_pdb,
                        pdb,
                        args.foxs_cmd,
                        per_dir_log,
                        per_dir_err,
                        per_dir_manifest,
                        global_manifest,
                        rel_base,
                    )
                )

        # Consume results
        failures = 0
        for fut in as_completed(futures):
            pdb_path, rc = fut.result()
            if rc != 0:
                failures += 1

    print("Completed FoXS runs.")
    print(f"- Total PDBs processed: {total_pdbs}")
    print(f"- Failures: {failures}")
    # print(
    #     f"- Global manifest: {global_manifest.relative_to(Path.cwd()) if global_manifest.exists() else '(not created)'}"
    # )

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
