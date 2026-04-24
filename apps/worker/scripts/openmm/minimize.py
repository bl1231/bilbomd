"""
This module provides functionality for energy minimization of a molecular system using OpenMM.
"""

import os
import sys
import yaml
from collections import defaultdict
from io import StringIO
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

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "utils"))
from glycam_rename import rename_glycam_residues  # noqa: E402

def _normalize_charmm_nucleic_names(pdb_text: str) -> str:
    """Rename CHARMM-style DNA residue names to standard PDB convention.

    pdb2crd.py emits ADE/GUA/CYT for DNA, but OpenMM's pdbNames.xml maps
    ADE->RNA A, GUA->RNA G, CYT->RNA C, causing PDBFixer to add spurious
    O2' atoms and subsequent createSystem failures. We detect DNA by the
    absence of the O2' ribose atom and rename to DA/DG/DC before PDBFixer.
    THY is already handled correctly by pdbNames.xml (THY->DT).
    """
    CHARMM_DNA_MAP = {"ADE": "DA ", "GUA": "DG ", "CYT": "DC "}

    lines = pdb_text.splitlines(keepends=True)

    residue_lines: dict = defaultdict(list)
    for i, line in enumerate(lines):
        if not line.startswith(("ATOM", "HETATM")):
            continue
        resname = line[17:20].strip()
        if resname in CHARMM_DNA_MAP:
            key = (line[21], line[22:26], resname)
            residue_lines[key].append(i)

    rename: dict = {}
    for (chain_id, resseq, resname), indices in residue_lines.items():
        atom_names = {lines[i][12:16].strip() for i in indices}
        if "O2'" not in atom_names and "O2*" not in atom_names:
            new_name = CHARMM_DNA_MAP[resname]
            for i in indices:
                rename[i] = new_name

    if not rename:
        return pdb_text

    result = []
    for i, line in enumerate(lines):
        if i in rename:
            line = line[:17] + rename[i] + line[20:]
        result.append(line)
    return "".join(result)


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
has_carbohydrates = config["input"].get("has_carbohydrates", False)

for d in [output_dir, min_dir, heat_dir, md_dir]:
    if not os.path.exists(d):
        os.makedirs(d)

# Step 1: Load (and optionally GLYCAM-rename) the PDB
with open(initial_pdb_file, "r", encoding="utf-8") as f:
    raw_pdb = f.read()

if has_carbohydrates:
    print("Glycoprotein mode: applying GLYCAM residue renaming before PDBFixer...")
    raw_pdb, glycam_log = rename_glycam_residues(raw_pdb)
    log_path = os.path.join(config["input"]["dir"], "glycam_rename.log")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(glycam_log) + "\n")
    print(f"GLYCAM rename log written to {log_path}")
    for line in glycam_log:
        print(line)

normalized_pdb = _normalize_charmm_nucleic_names(raw_pdb)
fixer = PDBFixer(pdbfile=StringIO(normalized_pdb))
fixer.findMissingResidues()
fixer.findNonstandardResidues()
if fixer.nonstandardResidues:
    print("Nonstandard residues found:")
    for residue in fixer.nonstandardResidues:
        print(f" - {residue}")
else:
    print("No nonstandard residues found.")

if has_carbohydrates:
    # Skip addMissingAtoms and addMissingHydrogens for glycoproteins: PDBFixer has no
    # carbohydrate templates and would corrupt or drop sugar atoms, and its hydrogen
    # placement triggers CCD downloads for GLYCAM residue names (NLN, OLS, OLT, 0MA,
    # 0NB, etc.) whose mmCIF entries contain '?' coordinates that PDBFixer cannot parse.
    # Hydrogens are added below via modeller.addHydrogens() using GLYCAM_06j-1.xml.
    print("Glycoprotein mode: skipping PDBFixer.addMissingAtoms() and addMissingHydrogens().")
else:
    fixer.findMissingAtoms()
    fixer.addMissingAtoms()
    fixer.addMissingHydrogens(pH=7.0)

# Step 2: Build the system using configured force fields
forcefield = ForceField(*config["input"]["forcefield"])
modeller = Modeller(fixer.topology, fixer.positions)

# PDBFixer.addMissingHydrogens can leave DNA/RNA residues partially hydrogenated
# (some H present but not all), causing addHydrogens to fail template matching.
# Strip all H atoms first so addHydrogens can place them from forcefield templates.
h_atoms = [
    atom
    for atom in modeller.topology.atoms()
    if atom.element is not None and atom.element.symbol == "H"
]
modeller.delete(h_atoms)
modeller.addHydrogens(forcefield, pH=7.0)

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
