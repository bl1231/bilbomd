#!/usr/bin/env python3
"""Atom-count scaling for IMP FoXS vs standalone FoXS (CPU/CUDA).

Builds synthetic N-copy assemblies of one PDB (copies translated apart) and
times each binary on them. Two numbers per size and tool:

  single_s   one `foxs -p model.pdb` process, end to end (what the worker
             pays per model today, including process/CUDA startup)
  batch_per_model_s
             wall time of one `foxs -p` process over --batch copies of the
             same structure, divided by --batch (amortised compute cost)

Also reports max relative profile error of each tool vs IMP at each size.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import time
from pathlib import Path

import numpy as np

TOOLS = {
    "imp-cpu": ["/usr/bin/foxs"],
    "new-cpu": ["/usr/local/bin/foxs-cpu"],
    "new-gpu": ["/usr/local/bin/foxs-gpu", "--gpu"],
}


def make_assembly(src: Path, copies: int, dst: Path, shift: float = 120.0) -> int:
    atoms = [ln for ln in src.read_text().splitlines() if ln.startswith(("ATOM", "HETATM"))]
    out, serial = [], 0
    side = int(np.ceil(copies ** (1 / 3)))
    for c in range(copies):
        dx, dy, dz = (c % side) * shift, (c // side % side) * shift, (c // side // side) * shift
        chain = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[c % 26]
        for ln in atoms:
            serial += 1
            x, y, z = float(ln[30:38]) + dx, float(ln[38:46]) + dy, float(ln[46:54]) + dz
            out.append(f"{ln[:6]}{serial % 100000:5d}{ln[11:21]}{chain}{ln[22:30]}"
                       f"{x:8.3f}{y:8.3f}{z:8.3f}{ln[54:]}")
    dst.write_text("\n".join(out) + "\nEND\n")
    return len(out)


def run(cmd: list[str], cwd: Path) -> float:
    t0 = time.perf_counter()
    subprocess.run(cmd, cwd=cwd, check=True, capture_output=True)
    return time.perf_counter() - t0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdb", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--copies", default="1,2,4,8")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--batch", type=int, default=10)
    a = ap.parse_args()

    res = []
    for n in [int(x) for x in a.copies.split(",")]:
        d = a.out / f"x{n}"
        d.mkdir(parents=True, exist_ok=True)
        natoms = make_assembly(a.pdb, n, d / "model.pdb")
        row: dict = {"copies": n, "atoms": natoms, "tools": {}}
        profiles = {}
        for name, cmd in TOOLS.items():
            td = d / name
            td.mkdir(exist_ok=True)
            (td / "model.pdb").write_text((d / "model.pdb").read_text())
            single = [run([*cmd, "-p", "model.pdb"], td) for _ in range(a.reps)]
            profiles[name] = np.loadtxt(td / "model.pdb.dat", comments="#")
            names = []
            for i in range(a.batch):
                f = td / f"b{i}.pdb"
                if not f.exists():
                    os.link(td / "model.pdb", f)
                names.append(f.name)
            batch = run([*cmd, "-p", *names], td)
            row["tools"][name] = {
                "single_s": statistics.median(single),
                "batch_per_model_s": batch / a.batch,
            }
            print(f"{natoms:>7} atoms {name}: single {statistics.median(single):.2f}s "
                  f"batch/model {batch / a.batch:.3f}s", flush=True)
        ref = profiles["imp-cpu"]
        scale = np.maximum(np.abs(ref[:, 1:]).max(axis=0), 1e-30)
        for name, p in profiles.items():
            row["tools"][name]["max_rel_err_vs_imp"] = float((np.abs(p[:, 1:] - ref[:, 1:]) / scale).max())
        res.append(row)
    (a.out / "scaling.json").write_text(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
