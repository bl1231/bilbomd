"""Strip molecular cofactors that have no Amber force-field parameters.

OpenMM's bundled Amber force fields (amber19-all.xml, GLYCAM_06j-1.xml, implicit/gbn2.xml)
do not include templates for common small-molecule cofactors such as FAD, heme, or NAD.
Retaining these residues causes ForceField.createSystem() to raise a ValueError.

This script removes them from the PDB in place and writes a JSON sidecar file
(stripped_cofactors.json) listing what was removed so the results pipeline can surface
a user-facing warning.

Future path: openmmforcefields (https://github.com/openmm/openmmforcefields) provides
GAFF-parameterized templates for arbitrary small molecules.

Usage:
    python strip_cofactors.py <pdb_file>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Residues with no parameters in amber19-all.xml + GLYCAM_06j-1.xml + gbn2.xml.
# Keep in sync with SUPPORTED_PDB_RESIDUES in packages/bilbomd-types/src/pdbResidues.ts
# when adding new entries here.
UNSUPPORTED_COFACTORS = frozenset([
    # Flavin cofactors
    "FAD", "FMN", "RBF",
    # Heme / porphyrins
    "HEM", "HEC", "HEA", "HEB",
    # Nicotinamide cofactors
    "NAD", "NAP", "NDP",
    # Pyridoxal phosphate
    "PLP", "PMP",
    # Thiamine
    "TPP", "TDP",
    # Coenzyme A
    "COA", "ACO",
    # Modified amino acid — pyroglutamate (N-terminal glutamine cyclisation)
    "PCA",
    # ATP / ADP / AMP
    "ATP", "ADP", "AMP",
    # Other common cofactors
    "SAH", "SAM", "HBI",
])


def strip_cofactors(lines: list[str]) -> tuple[list[str], dict[str, int]]:
    kept = []
    removed: dict[str, int] = {}
    for line in lines:
        if line.startswith(("ATOM", "HETATM")):
            resname = line[17:20].strip()
            if resname in UNSUPPORTED_COFACTORS:
                removed[resname] = removed.get(resname, 0) + 1
                continue
        kept.append(line)
    return kept, removed


def _run(pdb_path: Path) -> None:
    with pdb_path.open(encoding="utf-8") as f:
        lines = f.readlines()

    kept_lines, removed = strip_cofactors(lines)

    with pdb_path.open("w", encoding="utf-8") as f:
        f.writelines(kept_lines)

    sidecar = pdb_path.parent / "stripped_cofactors.json"
    with sidecar.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "stripped": removed,
                "note": (
                    "These cofactors were removed before OpenMM MD because they have no "
                    "parameters in the bundled Amber/GLYCAM force fields. They are retained "
                    "in the original uploaded PDB for FoXS calculations."
                ),
            },
            f,
            indent=2,
        )

    if removed:
        names = ", ".join(f"{k} ({v} atom record(s))" for k, v in sorted(removed.items()))
        print(f"strip_cofactors: removed {names} from {pdb_path.name}")
    else:
        print(f"strip_cofactors: no unsupported cofactors found in {pdb_path.name}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: strip_cofactors.py <pdb_file>", file=sys.stderr)
        sys.exit(1)
    _run(Path(sys.argv[1]))
