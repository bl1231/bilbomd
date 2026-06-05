"""Prepare a PDB file for OpenMM by removing incompatible residues.

Removes:
  - Water molecules (HOH) — crystal waters from CIF conversion typically
    lack hydrogen atoms and cannot be matched to any force-field template.
    Also unnecessary when using implicit solvent.
  - Metal ions and common polyatomic ions — no parameters exist for these
    in the Amber implicit-solvent force-field combination used by BilboMD.

Modifies the file in place.  Prints a summary so the caller (Node.js
worker) can surface the information in logs.

Usage:
    python prep_pdb.py <pdb_file>

The ion list mirrors KNOWN_IONS in tools/python/pdb2crd.py and
SUPPORTED_PDB_RESIDUES in packages/bilbomd-types/src/pdbResidues.ts.
"""

import sys

KNOWN_IONS = frozenset([
    # Alkali metals
    "LI", "NA", "K", "RB", "CS",
    # Alkaline earth
    "MG", "CA", "SR", "BA",
    # Transition metals
    "SC", "TI", "V", "CR", "MN", "FE", "CO", "NI", "CU", "ZN", "MO", "CD", "HG",
    # Post-transition metals / metalloids
    "AL", "GA", "IN", "SN", "PB", "B", "SE", "AS",
    # Halogens (as ions)
    "CL", "BR", "F",
    # Common polyatomic ions
    "SO4", "PO4", "NO3", "CN",
])


def strip_water(lines):
    """Remove HOH (water) ATOM/HETATM records."""
    kept = []
    removed = 0
    for line in lines:
        if line.startswith(("ATOM", "HETATM")) and line[17:20].strip() == "HOH":
            removed += 1
        else:
            kept.append(line)
    return kept, removed


def strip_ions(lines):
    """Remove metal ion and common polyatomic ion ATOM/HETATM records."""
    kept = []
    removed = 0
    for line in lines:
        if line.startswith(("ATOM", "HETATM")) and line[17:20].strip() in KNOWN_IONS:
            removed += 1
        else:
            kept.append(line)
    return kept, removed


if len(sys.argv) != 2:
    print("Usage: prep_pdb.py <pdb_file>", file=sys.stderr)
    sys.exit(1)

pdb_path = sys.argv[1]

with open(pdb_path, encoding="utf-8") as f:
    lines = f.readlines()

lines, n_water = strip_water(lines)
lines, n_ions = strip_ions(lines)

with open(pdb_path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print(
    f"prep_pdb: removed {n_water} water record(s) and "
    f"{n_ions} ion record(s) from {pdb_path}"
)
