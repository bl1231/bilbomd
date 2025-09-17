"""
This module provides functionality for energy minimization of a molecular system using OpenMM.
"""

import os
import sys
import yaml
from pdbfixer import PDBFixer
from openmm.app import (
    ForceField,
    Modeller,
    Simulation,
    PDBFile,
    CutoffNonPeriodic,
    HBonds,
)
from openmm import LangevinIntegrator
from openmm.unit import kelvin, picoseconds, nanometer

# Load the YAML configuration file
if len(sys.argv) != 2:
    print("Usage: python minimize.py <config.yaml>")
    sys.exit(1)

config_path = sys.argv[1]
with open(config_path, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

# Build output directories:
output_dir = config["output"]["output_dir"]
min_dir = os.path.join(output_dir, config["output"]["min_dir"])
heat_dir = os.path.join(output_dir, config["output"]["heat_dir"])
md_dir = os.path.join(output_dir, config["output"]["md_dir"])

initial_pdb_file = os.path.join(config["input"]["dir"], config["input"]["pdb_file"])
output_pdb_file_name = config["steps"]["minimization"]["output_pdb"]

for d in [output_dir, min_dir, heat_dir, md_dir]:
    if not os.path.exists(d):
        os.makedirs(d)

# Step 1: Load and fix the PDB
fixer = PDBFixer(filename=initial_pdb_file)
fixer.findMissingResidues()
fixer.findMissingAtoms()
fixer.addMissingAtoms()
fixer.addMissingHydrogens(pH=7.0)
fixer.findNonstandardResidues()
if fixer.nonstandardResidues:
    print("Nonstandard residues found:")
    for residue in fixer.nonstandardResidues:
        print(f" - {residue}")
else:
    print("No nonstandard residues found.")

# Step 2: Build the system using configured force fields
forcefield = ForceField(*config["input"]["forcefield"])
modeller = Modeller(fixer.topology, fixer.positions)

# ⚙️ Build system
system = forcefield.createSystem(
    modeller.topology,
    nonbondedMethod=CutoffNonPeriodic,
    nonbondedCutoff=1.2 * nanometer,
    constraints=HBonds,
    soluteDielectric=1.0,
    solventDielectric=78.5,
)

# Simulation setup
integrator = LangevinIntegrator(300 * kelvin, 1 / picoseconds, 0.002 * picoseconds)
simulation = Simulation(modeller.topology, system, integrator)
simulation.context.setPositions(modeller.positions)

# Energy minimization
print("Minimizing energy...")
simulation.minimizeEnergy()
print("✅ Minimization complete.")

# Save structure
positions = simulation.context.getState(getPositions=True).getPositions()
with open(os.path.join(min_dir, output_pdb_file_name), "w", encoding="utf-8") as f:
    PDBFile.writeFile(modeller.topology, positions, f)

print(f"✅ Saved {output_pdb_file_name}")
