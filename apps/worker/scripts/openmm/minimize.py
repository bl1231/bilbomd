"""
This module provides functionality for energy minimization of a molecular system using OpenMM.
"""

import math
import os
import sys

import yaml
from openmm import LangevinIntegrator
from openmm.app import (
    CutoffNonPeriodic,
    ForceField,
    HBonds,
    PDBFile,
    Simulation,
)
from openmm.unit import kelvin, kilojoules_per_mole, nanometer, picoseconds
from utils.clash_check import check_clashes
from utils.logger import get_logger
from utils.model_prep import prepare_modeller

logger = get_logger("minimize")

if len(sys.argv) != 2:
    logger.error("Usage: python minimize.py <config.yaml>")
    sys.exit(1)

config_path = sys.argv[1]
with open(config_path, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

# Build output directories
output_dir = config["output"]["output_dir"]
min_dir = os.path.join(output_dir, config["output"]["min_dir"])
heat_dir = os.path.join(output_dir, config["output"]["heat_dir"])
md_dir = os.path.join(output_dir, config["output"]["md_dir"])

initial_pdb_file = os.path.join(config["input"]["dir"], config["input"]["pdb_file"])
output_pdb_file_name = config["steps"]["minimization"]["output_pdb"]

for d in [output_dir, min_dir, heat_dir, md_dir]:
    if not os.path.exists(d):
        os.makedirs(d)

# Step 1: Load and prepare the structure
forcefield = ForceField(*config["input"]["forcefield"])
modeller = prepare_modeller(initial_pdb_file, config, forcefield)

# Step 2: Clash check — fail fast before spending time on minimization
hard_clashes, soft_clashes, examples = check_clashes(modeller)
if hard_clashes:
    logger.error(
        f"Found {hard_clashes} inter-residue atom pair(s) closer than 0.5 Å — "
        "input structure has severely overlapping atoms (possibly multiple molecules superimposed)."
    )
    for ex in examples:
        logger.error(f"  {ex}")
    sys.exit(1)
if soft_clashes:
    logger.warning(
        f"Found {soft_clashes} inter-residue atom pair(s) closer than 1.5 Å. "
        "Minimization may be slow or fail."
    )

# Step 3: Build the system
system = forcefield.createSystem(
    modeller.topology,
    nonbondedMethod=CutoffNonPeriodic,
    nonbondedCutoff=1.2 * nanometer,
    constraints=HBonds,
    soluteDielectric=1.0,
    solventDielectric=78.5,
)

# Step 4: Energy minimization
integrator = LangevinIntegrator(300 * kelvin, 1 / picoseconds, 0.002 * picoseconds)
simulation = Simulation(modeller.topology, system, integrator)
simulation.context.setPositions(modeller.positions)

logger.info("Minimizing energy...")
simulation.minimizeEnergy()
logger.info("✅ Minimization complete.")

# Energy gate: check that the minimized structure is physically reasonable.
# A well-minimized protein is typically in the range of -50,000 to +10,000 kJ/mol.
# Values above 1e6 kJ/mol indicate unresolved atom clashes that will cause NaN in MD.
state = simulation.context.getState(getEnergy=True)
pe = state.getPotentialEnergy().value_in_unit(kilojoules_per_mole)
logger.info(f"Post-minimization potential energy: {pe:.1f} kJ/mol")

if math.isnan(pe) or math.isinf(pe):
    logger.error("Potential energy is NaN/Inf after minimization — bad input structure.")
    sys.exit(1)

if pe > 1_000_000:
    logger.error(
        f"Potential energy ({pe:.1f} kJ/mol) is too high after minimization — "
        "severe atom clashes remain. Heating will fail."
    )
    sys.exit(1)

# Step 5: Save structure
positions = simulation.context.getState(getPositions=True).getPositions()
with open(os.path.join(min_dir, output_pdb_file_name), "w", encoding="utf-8") as f:
    PDBFile.writeFile(modeller.topology, positions, f, keepIds=True)

logger.info(f"✅ Saved {output_pdb_file_name}")
