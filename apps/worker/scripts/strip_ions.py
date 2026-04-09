"""Strip known metal ions and common polyatomic ions from a PDB file.

Modifies the file in place.  Prints the number of records removed so the
caller (Node.js worker) can surface this information in logs.

Usage:
    python strip_ions.py <pdb_file>

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

if len(sys.argv) != 2:
    print("Usage: strip_ions.py <pdb_file>", file=sys.stderr)
    sys.exit(1)

pdb_path = sys.argv[1]

with open(pdb_path, encoding="utf-8") as f:
    lines = f.readlines()

filtered = []
removed = 0
for line in lines:
    if line.startswith(("ATOM", "HETATM")) and line[17:20].strip() in KNOWN_IONS:
        removed += 1
    else:
        filtered.append(line)

with open(pdb_path, "w", encoding="utf-8") as f:
    f.writelines(filtered)

print(f"strip_ions: removed {removed} ion record(s) from {pdb_path}")
