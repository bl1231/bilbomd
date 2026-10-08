#!/usr/bin/env python3
"""Side-by-side benchmark of IMP FoXS vs standalone dina-lab3D FoXS (CPU/CUDA).

Takes a finished BilboMD job directory (read only), re-runs the FoXS step on
its MD models with each binary in several execution modes, then compares the
resulting profiles, single-model chi^2 fits, and downstream multi_foxs
ensembles. Everything is written under --out; the job dir is never modified.

See README.md next to this file.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import glob
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np

IMP = os.environ.get("FOXS_IMP", "/usr/bin/foxs")
NEW_CPU = os.environ.get("FOXS_NEW_CPU", "/usr/local/bin/foxs-cpu")
NEW_GPU = os.environ.get("FOXS_NEW_GPU", "/usr/local/bin/foxs-gpu")
MULTIFOXS = os.environ.get("MULTIFOXS", "/usr/bin/multi_foxs")

REFERENCE = "imp-cpu-perfile"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# --------------------------------------------------------------------------- #
# Staging
# --------------------------------------------------------------------------- #


def stage(job_dir: Path, exp_dat: str, out: Path, max_models: int) -> tuple[list[str], Path]:
    """Copy job PDBs to out/input/foxs/<rundir>/ and return relative paths."""
    src = sorted(glob.glob(str(job_dir / "foxs" / "*" / "*.pdb")))
    if not src:
        sys.exit(f"No PDBs under {job_dir}/foxs/*/")
    if max_models and len(src) > max_models:
        step = len(src) / max_models
        src = [src[int(i * step)] for i in range(max_models)]
    inp = out / "input"
    rels = []
    for s in src:
        rel = os.path.relpath(s, job_dir / "foxs")
        dst = inp / "foxs" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(s, dst)
        rels.append(rel)
    exp = inp / exp_dat
    if not exp.exists():
        shutil.copy2(job_dir / exp_dat, exp)
    # Warm the page cache so the first mode isn't penalised for disk reads.
    for r in rels:
        (inp / "foxs" / r).read_bytes()
    return rels, exp


def make_variant_dir(out: Path, name: str, rels: list[str]) -> Path:
    """Fresh out/runs/<name>/foxs tree of symlinks to the staged PDBs."""
    vdir = out / "runs" / name
    if vdir.exists():
        shutil.rmtree(vdir)
    for r in rels:
        dst = vdir / "foxs" / r
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.symlink(out / "input" / "foxs" / r, dst)
    return vdir


# --------------------------------------------------------------------------- #
# GPU sampling
# --------------------------------------------------------------------------- #


class GpuSampler:
    """Polls nvidia-smi while a mode runs. Records peak/mean util and memory."""

    def __init__(self, interval_ms: int = 250) -> None:
        self.samples: list[tuple[int, float, float]] = []
        self.interval_ms = interval_ms
        self.proc: subprocess.Popen[str] | None = None
        self.thread: threading.Thread | None = None

    def __enter__(self) -> "GpuSampler":
        if shutil.which("nvidia-smi") is None:
            return self
        self.proc = subprocess.Popen(
            [
                "nvidia-smi",
                "--query-gpu=index,utilization.gpu,memory.used",
                "--format=csv,noheader,nounits",
                f"-lms={self.interval_ms}",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()
        return self

    def _read(self) -> None:
        assert self.proc and self.proc.stdout
        for line in self.proc.stdout:
            try:
                i, u, m = (x.strip() for x in line.split(","))
                self.samples.append((int(i), float(u), float(m)))
            except ValueError:
                pass

    def __exit__(self, *exc: object) -> None:
        if self.proc:
            self.proc.terminate()
            self.proc.wait()

    def summary(self) -> dict[str, dict[str, float]]:
        res: dict[str, dict[str, float]] = {}
        for idx in sorted({s[0] for s in self.samples}):
            u = [s[1] for s in self.samples if s[0] == idx]
            m = [s[2] for s in self.samples if s[0] == idx]
            res[str(idx)] = {
                "util_mean": round(statistics.fmean(u), 1),
                "util_max": max(u),
                "mem_max_mib": max(m),
            }
        return res


# --------------------------------------------------------------------------- #
# Execution modes
# --------------------------------------------------------------------------- #


def run(cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> float:
    t0 = time.perf_counter()
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:4])}... failed ({p.returncode}): {p.stderr[-2000:]}")
    return time.perf_counter() - t0


MPS_PIPE: str | None = None  # set from --mps-pipe
USE_MPS = False  # toggled per mode


def gpu_env(gpus: list[str], i: int) -> dict[str, str]:
    env = dict(os.environ)
    env["CUDA_VISIBLE_DEVICES"] = gpus[i % len(gpus)]
    env.pop("CUDA_MPS_PIPE_DIRECTORY", None)
    if USE_MPS and MPS_PIPE:
        # Under MPS the client sees the daemon's device(s), not host indices.
        env["CUDA_MPS_PIPE_DIRECTORY"] = MPS_PIPE
        env.pop("CUDA_VISIBLE_DEVICES")
    return env


def mode_perfile(binary: str, extra: list[str], vdir: Path, rels: list[str], conc: int,
                 gpus: list[str] | None) -> dict[str, float]:
    """Production pattern: one `foxs -p model.pdb` process per model, cwd = run dir."""
    per: list[float] = []

    def one(i: int, rel: str) -> float:
        d = vdir / "foxs" / os.path.dirname(rel)
        env = gpu_env(gpus, i) if gpus else None
        return run([binary, *extra, "-p", os.path.basename(rel)], d, env)

    with cf.ThreadPoolExecutor(conc) as ex:
        per = list(ex.map(one, range(len(rels)), rels))
    return {"proc_median_s": statistics.median(per), "proc_max_s": max(per)}


def mode_batch(binary: str, extra: list[str], vdir: Path, rels: list[str], nproc: int,
               gpus: list[str] | None) -> dict[str, float]:
    """`foxs -p a.pdb b.pdb ...`: split models into nproc chunks, one process each."""
    chunks = [rels[i::nproc] for i in range(nproc)]
    chunks = [c for c in chunks if c]

    def one(i: int, chunk: list[str]) -> float:
        env = gpu_env(gpus, i) if gpus else None
        return run([binary, *extra, "-p", *chunk], vdir / "foxs", env)

    with cf.ThreadPoolExecutor(len(chunks)) as ex:
        per = list(ex.map(one, range(len(chunks)), chunks))
    return {"proc_median_s": statistics.median(per), "proc_max_s": max(per)}


def build_modes(a: argparse.Namespace) -> list[dict]:
    gpus = a.gpus.split(",")
    modes = [
        dict(name="imp-cpu-perfile", kind="perfile", bin=IMP, extra=[], n=a.cpus, gpus=None),
        dict(name="new-cpu-perfile", kind="perfile", bin=NEW_CPU, extra=[], n=a.cpus, gpus=None),
        dict(name="imp-cpu-batch", kind="batch", bin=IMP, extra=[], n=a.cpus, gpus=None),
        dict(name="new-cpu-batch", kind="batch", bin=NEW_CPU, extra=[], n=a.cpus, gpus=None),
        dict(name="new-gpu-perfile", kind="perfile", bin=NEW_GPU, extra=["--gpu"], n=a.cpus, gpus=gpus),
    ]
    for s in [int(x) for x in a.gpu_streams.split(",") if x]:
        modes.append(dict(name=f"new-gpu-batch-x{s}", kind="batch", bin=NEW_GPU, extra=["--gpu"],
                          n=s * len(gpus), gpus=gpus))
    if a.mps_pipe:
        modes.append(dict(name="new-gpu-perfile-mps", kind="perfile", bin=NEW_GPU, extra=["--gpu"],
                          n=a.cpus, gpus=gpus, mps=True))
        top = max(int(x) for x in a.gpu_streams.split(",") if x)
        modes.append(dict(name=f"new-gpu-batch-x{top}-mps", kind="batch", bin=NEW_GPU, extra=["--gpu"],
                          n=top * len(gpus), gpus=gpus, mps=True))
    if a.only:
        keep = set(a.only.split(",")) | {REFERENCE}
        modes = [m for m in modes if m["name"] in keep]
    return modes


def time_modes(a: argparse.Namespace, out: Path, rels: list[str]) -> dict[str, dict]:
    global USE_MPS
    results: dict[str, dict] = {}
    for m in build_modes(a):
        USE_MPS = bool(m.get("mps"))
        walls = []
        extra_stats: dict = {}
        gpu_stats: dict = {}
        for rep in range(a.repeats):
            vdir = make_variant_dir(out, m["name"], rels)
            log(f"{m['name']} rep {rep + 1}/{a.repeats}: {len(rels)} models, n={m['n']}")
            with GpuSampler() as gs:
                t0 = time.perf_counter()
                fn = mode_perfile if m["kind"] == "perfile" else mode_batch
                extra_stats = fn(m["bin"], m["extra"], vdir, rels, m["n"], m["gpus"])
                wall = time.perf_counter() - t0
            gpu_stats = gs.summary()
            walls.append(wall)
            log(f"  wall {wall:.1f}s  ({len(rels) / wall:.1f} models/s)")
        best = min(walls)
        results[m["name"]] = {
            "binary": m["bin"],
            "kind": m["kind"],
            "processes": m["n"],
            "gpus": m["gpus"],
            "mps": bool(m.get("mps")),
            "wall_s": walls,
            "wall_best_s": best,
            "models_per_s": len(rels) / best,
            "gpu": gpu_stats,
            **extra_stats,
        }
    USE_MPS = False
    ref = results[REFERENCE]["wall_best_s"]
    for r in results.values():
        r["speedup_vs_reference"] = ref / r["wall_best_s"]
    return results


def serial_latency(a: argparse.Namespace, out: Path, rels: list[str]) -> dict[str, dict]:
    """Single-model, single-process latency (includes process + CUDA startup)."""
    sample = rels[:: max(1, len(rels) // a.latency_samples)][: a.latency_samples]
    tools = {
        "imp-cpu": (IMP, []),
        "new-cpu": (NEW_CPU, []),
        "new-gpu": (NEW_GPU, ["--gpu"]),
    }
    res = {}
    for name, (b, extra) in tools.items():
        vdir = make_variant_dir(out, f"latency-{name}", sample)
        env = gpu_env(a.gpus.split(","), 0)
        ts = [run([b, *extra, "-p", os.path.basename(r)], vdir / "foxs" / os.path.dirname(r), env)
              for r in sample]
        res[name] = {"median_s": statistics.median(ts), "min_s": min(ts), "max_s": max(ts), "n": len(ts)}
        log(f"latency {name}: median {res[name]['median_s'] * 1000:.0f} ms")
    return res


# --------------------------------------------------------------------------- #
# Accuracy
# --------------------------------------------------------------------------- #


def load_profile(p: Path) -> np.ndarray:
    return np.loadtxt(p, comments="#")


def compare_profiles(out: Path, rels: list[str], variants: list[str]) -> dict[str, dict]:
    """Per-column error, normalised by that column's max |value| in the reference."""
    res = {}
    ref_dir = out / "runs" / REFERENCE / "foxs"
    ref = {r: load_profile(ref_dir / f"{r}.dat") for r in rels}
    for v in variants:
        vdir = out / "runs" / v / "foxs"
        if not vdir.exists():
            continue
        per_file_max = []
        per_col: list[list[float]] = []
        worst = ("", 0.0)
        shape_mismatch = 0
        for r in rels:
            a, b = load_profile(vdir / f"{r}.dat"), ref[r]
            if a.shape != b.shape:
                shape_mismatch += 1
                continue
            scale = np.maximum(np.abs(b[:, 1:]).max(axis=0), 1e-30)
            err = (np.abs(a[:, 1:] - b[:, 1:]) / scale).max(axis=0)
            per_col.append(err.tolist())
            m = float(err.max())
            per_file_max.append(m)
            if m > worst[1]:
                worst = (r, m)
        cols = np.array(per_col) if per_col else np.zeros((0, 0))
        res[v] = {
            "files": len(rels),
            "shape_mismatch": shape_mismatch,
            "max_rel_err_median": float(np.median(per_file_max)) if per_file_max else None,
            "max_rel_err_p99": float(np.percentile(per_file_max, 99)) if per_file_max else None,
            "max_rel_err_max": worst[1],
            "worst_file": worst[0],
            "per_column_max": cols.max(axis=0).tolist() if cols.size else [],
            "per_column_median": np.median(cols, axis=0).tolist() if cols.size else [],
        }
        log(f"profiles {v} vs {REFERENCE}: median {res[v]['max_rel_err_median']:.2e} "
            f"p99 {res[v]['max_rel_err_p99']:.2e} max {worst[1]:.2e}")
    return res


FIT_RE = re.compile(r"Chi\^2\s*=\s*([-\d.eE+]+)\s+c1\s*=\s*([-\d.eE+]+)\s+c2\s*=\s*([-\d.eE+]+)")


def fit_sample(a: argparse.Namespace, out: Path, rels: list[str], exp: Path) -> dict:
    """`foxs model.pdb exp.dat` on a sample of models with each tool; compare chi^2/c1/c2."""
    sample = rels[:: max(1, len(rels) // a.fit_samples)][: a.fit_samples]
    tools = {
        "imp-cpu": (IMP, []),
        "new-cpu": (NEW_CPU, []),
        "new-gpu": (NEW_GPU, ["--gpu"]),
    }
    gpus = a.gpus.split(",")
    fits: dict[str, dict[str, tuple[float, float, float]]] = {}
    for name, (b, extra) in tools.items():
        vdir = make_variant_dir(out, f"fit-{name}", sample)
        for r in sample:
            shutil.copy2(exp, vdir / "foxs" / os.path.dirname(r) / exp.name)

        def one(i: int, r: str) -> tuple[str, tuple[float, float, float]]:
            d = vdir / "foxs" / os.path.dirname(r)
            env = gpu_env(gpus, i) if extra else None
            p = subprocess.run([b, *extra, os.path.basename(r), exp.name], cwd=d, env=env,
                               capture_output=True, text=True, check=True)
            m = FIT_RE.search(p.stdout)
            if not m:
                raise RuntimeError(f"no fit line for {r}: {p.stdout[-500:]}")
            return r, (float(m[1]), float(m[2]), float(m[3]))

        conc = a.cpus if not extra else 2 * len(gpus)
        with cf.ThreadPoolExecutor(conc) as ex:
            fits[name] = dict(ex.map(one, range(len(sample)), sample))
        log(f"fits {name}: {len(fits[name])} models")

    ref = fits["imp-cpu"]
    ref_rank = sorted(ref, key=lambda r: ref[r][0])
    res: dict = {"n": len(sample), "tools": {}}
    for name, f in fits.items():
        d_chi = [abs(f[r][0] - ref[r][0]) for r in sample]
        rel_chi = [abs(f[r][0] - ref[r][0]) / max(ref[r][0], 1e-9) for r in sample]
        d_c1 = [abs(f[r][1] - ref[r][1]) for r in sample]
        d_c2 = [abs(f[r][2] - ref[r][2]) for r in sample]
        rank = sorted(f, key=lambda r: f[r][0])
        top10 = len(set(rank[:10]) & set(ref_rank[:10]))
        res["tools"][name] = {
            "chi2_abs_diff_median": statistics.median(d_chi),
            "chi2_abs_diff_max": max(d_chi),
            "chi2_rel_diff_median": statistics.median(rel_chi),
            "chi2_rel_diff_max": max(rel_chi),
            "c1_abs_diff_max": max(d_c1),
            "c2_abs_diff_max": max(d_c2),
            "spearman_rank_vs_imp": spearman([ref[r][0] for r in sample], [f[r][0] for r in sample]),
            "best_model": rank[0],
            "best_chi2": f[rank[0]][0],
            "top10_overlap_with_imp": top10,
        }
    res["raw"] = {n: {r: list(v) for r, v in f.items()} for n, f in fits.items()}
    return res


def spearman(x: list[float], y: list[float]) -> float:
    rx = np.argsort(np.argsort(x))
    ry = np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


# --------------------------------------------------------------------------- #
# multi_foxs
# --------------------------------------------------------------------------- #

ENS_HEAD = re.compile(r"^\s*(\d+)\s*\|\s*([\d.]+)\s*\|\s*x1\s+([\d.]+)\s*\(([-\d.]+),\s*([-\d.]+)\)")
ENS_MEMBER = re.compile(r"^\s*\d+\s*\|\s*([\d.]+)\s*\(.*\)\s*\|\s*(\S+)")


def parse_ensembles(path: Path, top: int) -> list[dict]:
    ens: list[dict] = []
    for line in path.read_text().splitlines():
        h = ENS_HEAD.match(line)
        if h:
            if len(ens) == top:
                break
            ens.append({"rank": int(h[1]), "chi2": float(h[2]), "c1": float(h[4]),
                        "c2": float(h[5]), "members": []})
            continue
        m = ENS_MEMBER.match(line)
        if m and ens:
            ens[-1]["members"].append({"weight": float(m[1]), "file": m[2]})
    return ens


def run_multifoxs(out: Path, variant: str, exp: Path) -> dict:
    vdir = out / "runs" / variant
    mdir = vdir / "multifoxs"
    if mdir.exists():
        shutil.rmtree(mdir)
    mdir.mkdir()
    # Same list the worker builds with `ls -1 ../foxs/*/*.pdb.dat`.
    dats = sorted(os.path.relpath(p, mdir) for p in glob.glob(str(vdir / "foxs" / "*" / "*.pdb.dat")))
    (mdir / "foxs_dat_files.txt").write_text("\n".join(dats) + "\n")
    t0 = time.perf_counter()
    with open(mdir / "multi_foxs.log", "w") as so, open(mdir / "multi_foxs_error.log", "w") as se:
        subprocess.run([MULTIFOXS, "-o", str(exp), "foxs_dat_files.txt"], cwd=mdir, stdout=so,
                       stderr=se, check=True)
    wall = time.perf_counter() - t0
    sizes = {}
    for f in sorted(mdir.glob("ensembles_size_*.txt")):
        n = int(f.stem.rsplit("_", 1)[1])
        sizes[n] = parse_ensembles(f, top=5)
    log(f"multi_foxs {variant}: {wall:.0f}s, sizes {sorted(sizes)}")
    return {"wall_s": wall, "ensembles": sizes}


def compare_multifoxs(mf: dict[str, dict]) -> dict:
    ref = mf.get(REFERENCE)
    if not ref:
        return {}
    res = {}
    for v, r in mf.items():
        rows = []
        for n, ens in sorted(ref["ensembles"].items()):
            other = r["ensembles"].get(n)
            if not ens or not other:
                continue
            a = {m["file"] for m in ens[0]["members"]}
            b = {m["file"] for m in other[0]["members"]}
            ref_top5 = [frozenset(m["file"] for m in e["members"]) for e in ens]
            rows.append({
                "size": n,
                "ref_chi2": ens[0]["chi2"],
                "chi2": other[0]["chi2"],
                "chi2_diff": other[0]["chi2"] - ens[0]["chi2"],
                "best_identical": a == b,
                "best_jaccard": len(a & b) / len(a | b),
                "best_in_ref_top5": frozenset(b) in ref_top5,
                "members": sorted(b),
                "ref_members": sorted(a),
            })
        res[v] = rows
    return res


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--job-dir", required=True, type=Path, help="Finished BilboMD job dir (read only)")
    ap.add_argument("--exp-dat", required=True, help="Experimental .dat file name inside --job-dir")
    ap.add_argument("--out", required=True, type=Path, help="Scratch output dir")
    ap.add_argument("--label", default="", help="Dataset label for the report")
    ap.add_argument("--cpus", type=int, default=18, help="CPU concurrency (prod worker limit = 18)")
    ap.add_argument("--gpus", default="0", help="Comma-separated CUDA device ids for GPU modes")
    ap.add_argument("--gpu-streams", default="1,2,4,8", help="Batch processes per GPU to try")
    ap.add_argument("--repeats", type=int, default=1)
    ap.add_argument("--max-models", type=int, default=0, help="Subsample models (0 = all)")
    ap.add_argument("--latency-samples", type=int, default=10)
    ap.add_argument("--fit-samples", type=int, default=200)
    ap.add_argument("--only", default="", help="Comma-separated mode names to run (plus reference)")
    ap.add_argument("--skip-multifoxs", action="store_true")
    ap.add_argument("--mps-pipe", default="", help="CUDA MPS pipe dir; adds *-mps GPU modes")
    a = ap.parse_args()
    global MPS_PIPE
    MPS_PIPE = a.mps_pipe or None

    a.out.mkdir(parents=True, exist_ok=True)
    log(f"staging {a.job_dir}")
    rels, exp = stage(a.job_dir, a.exp_dat, a.out, a.max_models)
    atoms = sum(1 for ln in (a.out / "input" / "foxs" / rels[0]).read_text().splitlines()
                if ln.startswith(("ATOM", "HETATM")))
    log(f"{len(rels)} models, {atoms} atoms in first model")

    results: dict = {
        "label": a.label or a.job_dir.name,
        "job_dir": str(a.job_dir),
        "models": len(rels),
        "atoms": atoms,
        "foxs_ref": Path("/opt/foxs-bench/FOXS_REF").read_text().strip()
        if Path("/opt/foxs-bench/FOXS_REF").exists() else None,
        "imp_version": subprocess.run([IMP, "--version"], capture_output=True, text=True).stdout.strip(),
        "args": {k: str(v) for k, v in vars(a).items()},
        "cpu_count": os.cpu_count(),
    }
    results["timing"] = time_modes(a, a.out, rels)
    results["latency"] = serial_latency(a, a.out, rels)
    variants = [v for v in results["timing"] if v != REFERENCE]
    results["profiles"] = compare_profiles(a.out, rels, variants)
    results["fits"] = fit_sample(a, a.out, rels, exp)

    if not a.skip_multifoxs:
        mf_variants = [REFERENCE, "new-cpu-perfile"]
        gpu_v = next((v for v in results["timing"] if v.startswith("new-gpu")), None)
        if gpu_v:
            mf_variants.append(gpu_v)
        mf_variants = [v for v in mf_variants if v in results["timing"]]
        log(f"multi_foxs on {mf_variants} (in parallel)")
        with cf.ThreadPoolExecutor(len(mf_variants)) as ex:
            futs = {v: ex.submit(run_multifoxs, a.out, v, exp) for v in mf_variants}
            mf = {v: f.result() for v, f in futs.items()}
        results["multifoxs"] = mf
        results["multifoxs_compare"] = compare_multifoxs(mf)

    (a.out / "results.json").write_text(json.dumps(results, indent=2))
    log(f"wrote {a.out / 'results.json'}")


if __name__ == "__main__":
    main()
