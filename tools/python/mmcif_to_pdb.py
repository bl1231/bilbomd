#!/usr/bin/env python3
"""
mmCIF → PDB converter (Biopython)

Usage:
  python mmcif_to_pdb.py input.cif output.pdb [--model 1] [--keep-hetero] [--keep-water]
"""

import argparse
from collections import defaultdict
from typing import Dict, Tuple

from Bio.PDB.Atom import Atom
from Bio.PDB.Chain import Chain
from Bio.PDB.MMCIFParser import MMCIFParser
from Bio.PDB.Model import Model
from Bio.PDB.PDBIO import PDBIO, Select
from Bio.PDB.Residue import Residue
from Bio.PDB.Structure import Structure


def choose_altloc_letters(
    model: Model,
) -> Dict[Tuple[str, Tuple[str, int, str], str], str]:
    """
    For each (chain_id, residue_id, atom_name) pick a single altloc letter to keep.
    Choice rule: highest occupancy -> altloc 'A' -> altloc ' ' -> first seen.
    """
    groups: Dict[Tuple[str, Tuple[str, int, str], str], Dict[str, float]] = defaultdict(
        dict
    )

    for chain in model:
        chain_id = chain.id
        for residue in chain:
            # residue.id is a tuple: (hetfield, resseq, icode)
            resid = residue.id
            for atom in residue:
                altloc = atom.get_altloc() or " "
                occ = atom.get_occupancy()
                occ_val = float(occ) if occ is not None else 0.0
                key = (chain_id, resid, atom.get_name())
                # Track the best occupancy seen for each altloc
                if altloc not in groups[key] or occ_val > groups[key][altloc]:
                    groups[key][altloc] = occ_val

    chosen: Dict[Tuple[str, Tuple[str, int, str], str], str] = {}
    for key, alt2occ in groups.items():
        # sort by (-occupancy, altloc priority)
        def alt_priority(a: str) -> Tuple[int, int]:
            # smaller tuple = higher priority
            # prefer 'A' (0), then ' ' (1), then other letters (2)
            base = 2
            if a == "A":
                base = 0
            elif a == " ":
                base = 1
            return (base, ord(a[0]) if a else 127)

        best = sorted(alt2occ.items(), key=lambda kv: (-kv[1], alt_priority(kv[0])))[0][
            0
        ]
        chosen[key] = best
    return chosen


class FilterForPDB(Select):
    def __init__(self, model: Model, keep_hetero: bool, keep_water: bool):
        super().__init__()
        self.keep_hetero = keep_hetero
        self.keep_water = keep_water
        self.chosen_altloc = choose_altloc_letters(model)

    def accept_model(self, model: Model) -> bool:
        return True

    def accept_chain(self, chain: Chain) -> bool:
        return True

    def accept_residue(self, residue: Residue) -> bool:
        hetfield, _, _ = residue.id  # (' ', resseq, icode) for standard residues
        resname = residue.get_resname().strip()
        is_hetero = hetfield != " "
        is_water = resname in {"HOH", "WAT", "H2O"}

        if is_water and not self.keep_water:
            return False
        if is_hetero and not is_water and not self.keep_hetero:
            return False
        return True

    def accept_atom(self, atom: Atom) -> bool:
        altloc = atom.get_altloc() or " "
        chain_id = atom.get_parent().get_parent().id  # residue.parent = chain
        resid = atom.get_parent().id  # residue.id tuple
        key = (chain_id, resid, atom.get_name())
        chosen = self.chosen_altloc.get(key, altloc)
        return altloc == chosen or (altloc in ("", " ") and chosen in ("", " "))


def load_structure(path: str) -> Structure:
    parser = MMCIFParser(QUIET=True)
    # The structure id is arbitrary here
    return parser.get_structure("in", path)


def get_model(structure: Structure, model_index_1based: int) -> Model:
    models = list(structure)
    if not models:
        raise RuntimeError("No models found in structure.")
    idx = model_index_1based - 1
    if idx < 0 or idx >= len(models):
        raise IndexError(f"Model {model_index_1based} out of range (1..{len(models)})")
    return models[idx]


def mmcif_to_pdb(
    cif_path: str,
    pdb_path: str,
    model_index: int = 1,
    keep_hetero: bool = False,
    keep_water: bool = False,
) -> None:
    structure = load_structure(cif_path)
    model = get_model(structure, model_index)
    io = PDBIO()
    io.set_structure(model)
    io.save(
        pdb_path,
        select=FilterForPDB(model, keep_hetero=keep_hetero, keep_water=keep_water),
    )


def main():
    ap = argparse.ArgumentParser(
        description="Convert mmCIF to PDB with simple hygiene rules."
    )
    ap.add_argument("input", help="Input mmCIF file (.cif/.mmcif)")
    ap.add_argument("output", help="Output PDB file (.pdb)")
    ap.add_argument(
        "--model", type=int, default=1, help="1-based model index to write (default: 1)"
    )
    ap.add_argument(
        "--keep-hetero", action="store_true", help="Keep hetero residues/ligands"
    )
    ap.add_argument("--keep-water", action="store_true", help="Keep water (HOH/WAT)")
    args = ap.parse_args()

    mmcif_to_pdb(
        args.input,
        args.output,
        model_index=args.model,
        keep_hetero=args.keep_hetero,
        keep_water=args.keep_water,
    )
    print(f"Wrote PDB to {args.output}")


if __name__ == "__main__":
    main()
