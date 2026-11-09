"""Rg-steered BioEmu2 sampling for one BilboMD job (bilbomd#1200).

Inputs, written into the job directory by the backend (system) and the worker (params):
  bioemu/system.yaml   BioEmu2 System: entities with asym_ids (copies) and sequences
  bioemu/params.json   {"rgs": [...], "num_samples_per_rg": 50, "batch_size": 40,
                        "num_steps": 50, "num_gd_steps": 5, "rg_weight": 0.02,
                        "default_potentials": true, "seed": 0}

For each Rg target: sample with BioEmu2's default physicality potentials plus a Cα-Rg
potential (the Phase 0 "steer" config), check physicality, and write the physical frames
as foxs/rg<target>/bioemu_rg<target>_<NNNN>.pdb, where BilboMD's FoXS step picks them up.
Each PDB starts with ``REMARK DCD2PDB_RG <stem> <Rg> <Dmax>`` (Cα, Å), which the results
Rg-vs-Dmax analysis reads. Raw samples stay in bioemu/rg<target>/.

Progress goes to bioemu/progress.json after each target, and a summary to
bioemu/summary.json at the end.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import mdtraj
import numpy as np
from params import MIN_PHYSICAL_TOTAL, Params, SamplingError, rg_label

logger = logging.getLogger("bioemu2-service.sampler")

SYSTEM_FILE = "bioemu/system.yaml"
PARAMS_FILE = "bioemu/params.json"  # see params.py
PROGRESS_FILE = "bioemu/progress.json"
SUMMARY_FILE = "bioemu/summary.json"

def ca_rg_dmax(traj: mdtraj.Trajectory) -> tuple[np.ndarray, np.ndarray]:
    ca = traj.topology.select("name CA and protein")
    xyz = traj.xyz[:, ca] * 10.0
    rg = np.sqrt(((xyz - xyz.mean(1, keepdims=True)) ** 2).sum(-1).mean(-1))
    dmax = np.array([np.max(np.linalg.norm(f[:, None] - f[None], axis=-1)) for f in xyz])
    return rg, dmax


def write_pdbs(traj: mdtraj.Trajectory, keep: np.ndarray, out_dir: Path, label: str) -> int:
    """Write the kept frames as PDBs with the REMARK line the results analysis reads."""
    out_dir.mkdir(parents=True, exist_ok=True)
    rg, dmax = ca_rg_dmax(traj)
    # CIF topologies can carry atom serials as strings, which mdtraj's PDB writer
    # can't format; let it number atoms itself.
    for atom in traj.topology.atoms:
        atom.serial = None
    written = 0
    for i in np.flatnonzero(keep):
        stem = f"bioemu_{label}_{i:04d}"
        path = out_dir / f"{stem}.pdb"
        traj[i].save_pdb(str(path))
        body = path.read_text()
        path.write_text(f"REMARK DCD2PDB_RG {stem} {rg[i]:.3f} {dmax[i]:.3f}\n{body}")
        written += 1
    return written


class Sampler:
    """Holds the BioEmu2 model across jobs, so torch.compile's warm-up is paid once."""

    def __init__(self, compile_denoiser: bool = True):
        self.compile_denoiser = compile_denoiser
        self._model = None

    def model(self):
        if self._model is None:
            from bioemu2 import load_model

            t0 = time.time()
            self._model = load_model(matmul_precision="high", compile_denoiser=self.compile_denoiser)
            logger.info("BioEmu2 model loaded in %.0f s", time.time() - t0)
        return self._model

    def run(self, work_dir: Path) -> dict:
        import torch
        from bioemu2 import EmuSession, GuidedFKSampler, System, save_frames
        from bioemu2.denoising.steering.potentials import get_default_potentials
        from bioemu2.physicality import PhysicalityFilterMode, check_allatom_physicality
        from rg_potential import CaRgPotential

        system_path = work_dir / SYSTEM_FILE
        params_path = work_dir / PARAMS_FILE
        for p in (system_path, params_path):
            if not p.exists():
                raise SamplingError(f"{p.relative_to(work_dir)} missing")
        params = Params.load(params_path)
        try:
            system = System.from_yaml(system_path)
        except Exception as e:  # pydantic validation of the entities
            raise SamplingError(f"invalid {SYSTEM_FILE}: {e}") from e

        t_start = time.time()
        # The MSA is fetched (or read from BIOEMU2_MSA_CACHE) on the first sample call
        emu = EmuSession(system, model=self.model(), mode="equilibrium")
        targets = {}
        progress_path = work_dir / PROGRESS_FILE
        for i, rg in enumerate(params.rgs):
            label = rg_label(rg)
            pots = [CaRgPotential(rg, weight=params.guidance_weight())]
            if params.default_potentials:
                pots += list(get_default_potentials())
            sampler = GuidedFKSampler(
                potentials=pots,
                resampling_interval=None,
                num_gd_steps=params.num_gd_steps,
                num_steps=params.num_steps,
            )
            raw_dir = work_dir / "bioemu" / label
            if torch.cuda.is_available():
                torch.cuda.reset_peak_memory_stats()
            t0 = time.time()
            traj = emu.sample(
                num_samples=params.num_samples_per_rg,
                batch_size=params.batch_size,
                sampler=sampler,
                seed=params.seed + i,
                partial_dir=raw_dir / "partial",
            )
            seconds = time.time() - t0
            save_frames(traj, raw_dir)  # samples.xtc + topology.cif, kept for debugging
            passed, _, reasons = check_allatom_physicality(traj, mode=PhysicalityFilterMode.HIGH_QUALITY)
            passed = np.asarray(passed, dtype=bool)
            written = write_pdbs(traj, passed, work_dir / "foxs" / label, label)
            rg_ca, _ = ca_rg_dmax(traj)
            failed_reasons: dict[str, int] = {}
            for ok, reason in zip(passed, reasons):
                if not ok:
                    key = str(reason) or "unknown"
                    failed_reasons[key] = failed_reasons.get(key, 0) + 1
            targets[label] = {
                "rg_target": rg,
                "frames": int(traj.n_frames),
                "physical": int(written),
                "rg_mean": float(rg_ca.mean()),
                "rg_sd": float(rg_ca.std()),
                "seconds": seconds,
                "peak_gpu_gb": torch.cuda.max_memory_allocated() / 1e9 if torch.cuda.is_available() else None,
                "failed_reasons": failed_reasons,
            }
            logger.info(
                "%s %s: %d/%d physical, Rg %.1f±%.1f Å, %.0f s",
                work_dir.name, label, written, traj.n_frames, rg_ca.mean(), rg_ca.std(), seconds,
            )  # fmt: skip
            progress_path.write_text(json.dumps({"done": i + 1, "total": len(params.rgs), "last": targets[label]}))

        total_physical = sum(t["physical"] for t in targets.values())
        summary = {
            "params": params.__dict__,
            "tokens": sum(len(getattr(e, "sequence", "")) * len(e.asym_ids) for e in system.entities),
            "targets": targets,
            "total_frames": sum(t["frames"] for t in targets.values()),
            "total_physical": total_physical,
            "seconds": time.time() - t_start,
        }
        (work_dir / SUMMARY_FILE).write_text(json.dumps(summary, indent=2))
        if total_physical < MIN_PHYSICAL_TOTAL:
            raise SamplingError(
                f"only {total_physical} of {summary['total_frames']} BioEmu2 structures passed the "
                f"physicality check (need at least {MIN_PHYSICAL_TOTAL})"
            )
        return summary
