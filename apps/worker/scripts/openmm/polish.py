"""Polish final ensemble members: model prep, then a restrained OpenMM minimization.

Used by the BioEmu2 pipeline (bilbomd#1200) on the members of the best MultiFoXS
ensembles, so users get physically reasonable models. BioEmu2 samples are close to
the right shape but carry small clashes and stretched bonds; this removes them while
keeping the SAXS-relevant shape (Phase 0: heavy-atom RMSD ~0.35 Å, Cα Rg −0.01 to
−0.08 Å, ensemble χ² unchanged or better, MolProbity 1.5–2.6 → 0.8–1.0).

    python polish.py jobs.json results.json

jobs.json: [{"in": "/path/member.pdb", "out": "/path/member_polished.pdb"}, ...]

Per structure:
  1. prepare_modeller(): PDBFixer missing atoms + hydrogens, with BilboMD's handling of
     CHARMM36 phospho-residues and nucleic-acid names (the same prep as minimize.py);
  2. heavy-atom harmonic position restraints at the input coordinates,
     k = 1 kcal/mol/Å² (418.4 kJ/mol/nm²);
  3. minimizeEnergy() with GBn2 implicit solvent, the nonbonded setup of minimize.py.

results.json gets one entry per job with energies (force field only, without the
restraint), heavy-atom RMSD and Cα Rg before/after, or the error. A failed structure
doesn't stop the others; the exit code is 0 unless no structure could be polished.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
import traceback

import numpy as np
from openmm import CustomExternalForce, LangevinIntegrator, Platform
from openmm.app import CutoffNonPeriodic, ForceField, HBonds, PDBFile, Simulation
from openmm.unit import kelvin, kilojoules_per_mole, nanometer, picoseconds
from utils.logger import get_logger
from utils.model_prep import prepare_modeller

logger = get_logger("polish")

# Same rule as openmm-functions.ts: CHARMM36 when the model has phospho/modified
# backbone residues that AMBER19 lacks. BioEmu2 output has no glycans.
CHARMM36_RESIDUES = frozenset({"SEP", "TPO", "PTR", "CYM", "CYSP"})
K_RESTRAINT = 418.4  # kJ/mol/nm² = 1 kcal/mol/Å²
MAX_ITERATIONS = 2000


def residue_names(pdb_text: str) -> set[str]:
    return {line[17:20].strip() for line in pdb_text.splitlines() if line.startswith(("ATOM", "HETATM"))}


def forcefield_files(pdb_text: str) -> tuple[list[str], bool]:
    charmm = bool(residue_names(pdb_text) & CHARMM36_RESIDUES)
    files = ["charmm36_2024.xml", "implicit/gbn2.xml"] if charmm else ["amber19-all.xml", "implicit/gbn2.xml"]
    return files, charmm


def ca_rg(topology, pos_nm: np.ndarray) -> float:
    idx = [a.index for a in topology.atoms() if a.name == "CA" and a.element is not None and a.element.symbol == "C"]
    x = pos_nm[idx] * 10.0
    return float(np.sqrt(((x - x.mean(0)) ** 2).sum(1).mean()))


def pick_platform() -> Platform:
    wanted = os.environ.get("OPENMM_PLATFORM")
    names = [Platform.getPlatform(i).getName() for i in range(Platform.getNumPlatforms())]
    if wanted:
        return Platform.getPlatformByName(wanted)
    return Platform.getPlatformByName("CUDA" if "CUDA" in names else "CPU")


def polish(job: dict, platform: Platform, k: float = K_RESTRAINT) -> dict:
    t0 = time.time()
    with open(job["in"], encoding="utf-8") as f:
        ff_files, charmm = forcefield_files(f.read())
    forcefield = ForceField(*ff_files)
    config = {
        "input": {
            "dir": os.path.dirname(job["out"]) or ".",
            "has_carbohydrates": False,
            "has_charmm36_residues": charmm,
        }
    }
    modeller = prepare_modeller(job["in"], config, forcefield)
    system = forcefield.createSystem(
        modeller.topology,
        nonbondedMethod=CutoffNonPeriodic,
        nonbondedCutoff=1.2 * nanometer,
        constraints=HBonds,
        soluteDielectric=1.0,
        solventDielectric=78.5,
    )
    pos0 = np.array(modeller.positions.value_in_unit(nanometer))
    heavy = [a.index for a in modeller.topology.atoms() if a.element is not None and a.element.symbol != "H"]
    restraint = CustomExternalForce("0.5*k*((x-x0)^2+(y-y0)^2+(z-z0)^2)")
    restraint.addGlobalParameter("k", k)
    for p in ("x0", "y0", "z0"):
        restraint.addPerParticleParameter(p)
    for i in heavy:
        restraint.addParticle(i, pos0[i].tolist())
    restraint.setForceGroup(1)
    system.addForce(restraint)

    integrator = LangevinIntegrator(300 * kelvin, 1 / picoseconds, 0.002 * picoseconds)
    sim = Simulation(modeller.topology, system, integrator, platform)
    sim.context.setPositions(modeller.positions)

    def energy() -> float:
        # force group 0 = the force field only; the restraint is group 1
        e = sim.context.getState(getEnergy=True, groups={0}).getPotentialEnergy()
        return e.value_in_unit(kilojoules_per_mole)

    e_before = energy()
    sim.minimizeEnergy(maxIterations=MAX_ITERATIONS)
    e_after = energy()
    if not math.isfinite(e_after):
        raise RuntimeError(f"potential energy is {e_after} after minimization")
    pos1 = np.array(sim.context.getState(getPositions=True).getPositions().value_in_unit(nanometer))
    with open(job["out"], "w", encoding="utf-8") as f:
        PDBFile.writeFile(modeller.topology, pos1 * nanometer, f, keepIds=True)
    return {
        **job,
        "ok": True,
        "forcefield": ff_files[0],
        "energy_before": e_before if math.isfinite(e_before) else None,
        "energy_after": e_after,
        "heavy_rmsd": float(np.sqrt(((pos1[heavy] - pos0[heavy]) ** 2).sum(1).mean()) * 10.0),
        "rg_before": ca_rg(modeller.topology, pos0),
        "rg_after": ca_rg(modeller.topology, pos1),
        "seconds": time.time() - t0,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        logger.error("Usage: python polish.py <jobs.json> <results.json>")
        return 2
    with open(argv[1], encoding="utf-8") as f:
        jobs = json.load(f)
    platform = pick_platform()
    logger.info(f"Polishing {len(jobs)} structures on {platform.getName()}")
    results = []
    for job in jobs:
        try:
            r = polish(job, platform)
            logger.info(
                f"Polished {os.path.basename(job['in'])}: RMSD {r['heavy_rmsd']:.2f} Å, "
                f"Rg {r['rg_before']:.2f} -> {r['rg_after']:.2f} Å, {r['seconds']:.0f} s"
            )
        except Exception as e:  # noqa: BLE001 - one bad structure shouldn't stop the batch
            traceback.print_exc()
            r = {**job, "ok": False, "error": f"{type(e).__name__}: {e}"}
            logger.warning(f"Could not polish {os.path.basename(job['in'])}: {r['error']}")
        results.append(r)
        with open(argv[2], "w", encoding="utf-8") as f:
            json.dump(results, f, indent=1)
    if jobs and not any(r["ok"] for r in results):
        logger.error("No structure could be polished")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
