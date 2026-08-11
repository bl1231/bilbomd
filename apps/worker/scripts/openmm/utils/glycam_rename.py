"""GLYCAM residue renaming for OpenMM glycoprotein preparation.

Converts standard PDB carbohydrate residue names and their attached protein residues
into the GLYCAM naming scheme required by amber14/GLYCAM_06j-1.xml.

GLYCAM naming convention (3-character codes):
  - Character 1: which hydroxyl oxygen(s) of THIS residue are substituted by a
    child sugar. 0 = none (terminal); 2/3/4/6 = a single O2/O3/O4/O6 linkage;
    branched sugars use a letter code (e.g. V = 3,6; X = 2,6; W = 3,4; U = 4,6).
    The residue's own C1 bond (to its parent sugar or the protein/aglycon) is
    always implied.
  - Character 2: sugar identity letter (Y=GlcNAc, M=Man, G=Glc, A=Gal, F=Fuc, ...)
  - Character 3: anomeric configuration (A=alpha, B=beta)

Special protein-side residue names (modified amino acids):
  - NLN  = Asn with N-linked GlcNAc (ND2 bonds to C1; only one H on ND2)
  - OLT  = Thr with O-linked sugar (OG1 bonds to C1; OG1 loses its H)
  - OLS  = Ser with O-linked sugar (OG bonds to C1; OG loses its H)

Usage (as a standalone script):
    python glycam_rename.py <input.pdb> [--inplace | --output <out.pdb>]

Usage (as an importable module):
    from utils.glycam_rename import rename_glycam_residues
    modified_pdb_text = rename_glycam_residues(pdb_text)
"""

from __future__ import annotations

import argparse
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional
from utils.logger import get_logger

logger = get_logger("glycam_rename")


# ---------------------------------------------------------------------------
# GLYCAM sugar identity letter map: PDB 3-letter code → GLYCAM letter
# ---------------------------------------------------------------------------
SUGAR_LETTER: dict[str, str] = {
    "NAG": "Y",  # GlcNAc (N-acetylglucosamine) — GLYCAM letter Y
    "NDG": "Y",  # GlcNAc (alternate PDB code, alpha form)
    "MAN": "M",  # Mannose
    "BMA": "M",  # Beta-mannose (often labeled BMA in PDB)
    "GLC": "G",  # Glucose
    "BGC": "G",  # Beta-glucose
    "GAL": "A",  # Galactose
    "GLA": "A",  # Galactose (alternate)
    "FUC": "F",  # Fucose
    "FUL": "F",  # L-fucose
    "SIA": "S",  # Sialic acid (Neu5Ac) — simplified
    "NAN": "S",  # Sialic acid (alternate)
    "XYL": "X",  # Xylose
    "RIB": "R",  # Ribose
    "GUL": "K",  # Gulose
    "ALL": "L",  # Allose
    "ALT": "D",  # Altrose
    "TAL": "T",  # Talose
    "IDO": "I",  # Idose
}

# Sugars whose anomeric C1 is typically alpha in PDB crystal structures
# (used as default when geometry-based detection is ambiguous)
DEFAULT_ALPHA: frozenset[str] = frozenset(["MAN", "FUC", "FUL", "SIA", "NAN"])
DEFAULT_BETA: frozenset[str] = frozenset(["NAG", "NDG", "GAL", "GLA", "GLC", "BGC", "BMA"])

# Per-residue atom name remapping needed to convert PDB atom names to GLYCAM names.
# NAG/NDG use C7/C8/O7 for the acetamide group in PDB but GLYCAM templates expect
# C2N/CME/O2N.  All other residues use the same atom names in both conventions.
_ATOM_NAME_REMAP: dict[str, dict[str, str]] = {
    "NAG": {"C7": "C2N", "O7": "O2N", "C8": "CME"},
    "NDG": {"C7": "C2N", "O7": "O2N", "C8": "CME"},
}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Atom:
    record: str       # "ATOM" or "HETATM"
    serial: int
    name: str
    alt_loc: str
    resname: str
    chain_id: str
    resseq: int
    icode: str
    x: float
    y: float
    z: float
    occupancy: float
    bfactor: float
    element: str
    line_index: int   # index in the original lines list


@dataclass
class Residue:
    resname: str
    chain_id: str
    resseq: int
    icode: str
    atoms: list[Atom] = field(default_factory=list)

    @property
    def key(self) -> tuple[str, int, str]:
        return (self.chain_id, self.resseq, self.icode)

    def get_atom(self, name: str) -> Optional[Atom]:
        for a in self.atoms:
            if a.name == name:
                return a
        return None

    def coords(self, name: str) -> Optional[tuple[float, float, float]]:
        a = self.get_atom(name)
        return (a.x, a.y, a.z) if a else None


# ---------------------------------------------------------------------------
# PDB parsing helpers
# ---------------------------------------------------------------------------

def _parse_atom_line(line: str, line_index: int) -> Optional[Atom]:
    if not line.startswith(("ATOM  ", "HETATM")):
        return None
    try:
        return Atom(
            record=line[0:6].strip(),
            serial=int(line[6:11]),
            name=line[12:16].strip(),
            alt_loc=line[16],
            resname=line[17:20].strip(),
            chain_id=line[21],
            resseq=int(line[22:26]),
            icode=line[26],
            x=float(line[30:38]),
            y=float(line[38:46]),
            z=float(line[46:54]),
            occupancy=float(line[54:60]) if line[54:60].strip() else 1.0,
            bfactor=float(line[60:66]) if line[60:66].strip() else 0.0,
            element=line[76:78].strip() if len(line) >= 78 else "",
            line_index=line_index,
        )
    except (ValueError, IndexError):
        return None


def _parse_link_record(line: str) -> Optional[tuple[str, str, int, str, str, int]]:
    """Parse a LINK record. Returns (atom1, chain1, resseq1, atom2, chain2, resseq2)."""
    if not line.startswith("LINK"):
        return None
    try:
        atom1 = line[12:16].strip()
        chain1 = line[21]
        resseq1 = int(line[22:26])
        atom2 = line[42:46].strip()
        chain2 = line[51]
        resseq2 = int(line[52:56])
        return atom1, chain1, resseq1, atom2, chain2, resseq2
    except (ValueError, IndexError):
        return None


def _distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _vec(a: tuple, b: tuple) -> tuple:
    return tuple(b[i] - a[i] for i in range(3))


def _dot(u: tuple, v: tuple) -> float:
    return sum(u[i] * v[i] for i in range(3))


def _cross(u: tuple, v: tuple) -> tuple:
    return (
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    )


# ---------------------------------------------------------------------------
# Anomer determination
# ---------------------------------------------------------------------------

def _is_alpha_anomer(res: Residue) -> bool:
    """Determine whether the sugar C1 is in the alpha configuration.

    For pyranose rings in D-sugars:
      - Alpha: O1 is axial (on the same side as O5 relative to the ring plane)
      - Beta:  O1 is equatorial (opposite side from O5)

    We use the sign of the scalar triple product of:
      (C1→C2), (C1→O5), (C1→O1)
    A positive value indicates O1 and O5 are on the same side → alpha.

    Falls back to a default (from DEFAULT_ALPHA / DEFAULT_BETA sets) when atoms
    are missing.
    """
    c1 = res.coords("C1")
    c2 = res.coords("C2")
    o5 = res.coords("O5")
    o1 = res.coords("O1")

    if not all([c1, c2, o5, o1]):
        # Geometry unavailable — use crystallographic default
        return res.resname in DEFAULT_ALPHA

    v_c2 = _vec(c1, c2)
    v_o5 = _vec(c1, o5)
    v_o1 = _vec(c1, o1)

    # Normal to the C1-C2-O5 plane
    normal = _cross(v_c2, v_o5)
    # Positive dot with O1 vector → O1 on same side as normal → alpha
    return _dot(normal, v_o1) > 0


# ---------------------------------------------------------------------------
# Bond detection
# ---------------------------------------------------------------------------

BOND_THRESHOLD = 1.9  # Å — generous upper bound for covalent bonds


def _build_atom_index(
    residues: dict[tuple, Residue]
) -> list[tuple[tuple[float, float, float], str, int, Atom]]:
    """Flat list of (coords, chain_id, resseq, Atom) for distance searches."""
    index = []
    for res in residues.values():
        for a in res.atoms:
            index.append(((a.x, a.y, a.z), a.chain_id, a.resseq, a))
    return index


def _find_bonded_atom(
    src_atom: Atom,
    target_resname: str,
    target_atom_name: str,
    atom_index: list,
) -> Optional[tuple[str, int]]:
    """Return (chain_id, resseq) of a bonded target atom, or None."""
    src = (src_atom.x, src_atom.y, src_atom.z)
    for coords, chain_id, resseq, atom in atom_index:
        if atom.resname != target_resname:
            continue
        if atom.name != target_atom_name:
            continue
        if _distance(src, coords) <= BOND_THRESHOLD:
            return chain_id, resseq
    return None


# ---------------------------------------------------------------------------
# Core renaming logic
# ---------------------------------------------------------------------------

CARBOHYDRATE_RESNAMES: frozenset[str] = frozenset(SUGAR_LETTER.keys())
PROTEIN_RESNAMES: frozenset[str] = frozenset([
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS",
    "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
    "HSD", "HSE", "HIE", "HID",
])


def rename_glycam_residues(pdb_text: str) -> tuple[str, list[str]]:
    """Rename PDB residues to GLYCAM format.

    Returns:
        modified_pdb_text: PDB text with GLYCAM residue names in place
        log_lines: human-readable description of every rename made
    """
    lines = pdb_text.splitlines(keepends=True)

    # --- Parse atoms and residues ---
    residues: dict[tuple, Residue] = {}
    for i, line in enumerate(lines):
        atom = _parse_atom_line(line, i)
        if atom is None:
            continue
        key = (atom.chain_id, atom.resseq, atom.icode)
        if key not in residues:
            residues[key] = Residue(
                resname=atom.resname,
                chain_id=atom.chain_id,
                resseq=atom.resseq,
                icode=atom.icode,
            )
        residues[key].atoms.append(atom)

    # --- Parse LINK records ---
    # links: set of frozenset({(chain1,resseq1,atom1), (chain2,resseq2,atom2)})
    explicit_bonds: list[tuple] = []  # (chain1, resseq1, atom1, chain2, resseq2, atom2)
    for line in lines:
        parsed = _parse_link_record(line)
        if parsed:
            explicit_bonds.append(parsed)

    # Build atom index for distance-based fallback
    atom_index = _build_atom_index(residues)

    # --- Determine glycosylation sites ---
    # Maps protein residue key → new name (NLN, OLT, OLS)
    protein_renames: dict[tuple, str] = {}
    # Maps sugar residue key → new GLYCAM name
    sugar_renames: dict[tuple, str] = {}
    # Maps protein-linked (reducing-end) sugar key → human-readable link description
    protein_linked_sugars: dict[tuple, str] = {}

    log_lines: list[str] = []

    # Helper to look up residue by (chain, resseq)
    def get_res(chain: str, resseq: int) -> Optional[Residue]:
        for icode in ["", " ", "A"]:
            key = (chain, resseq, icode)
            if key in residues:
                return residues[key]
        return None

    # Process explicit LINK records first
    for atom1, chain1, resseq1, atom2, chain2, resseq2 in explicit_bonds:
        res1 = get_res(chain1, resseq1)
        res2 = get_res(chain2, resseq2)
        if res1 is None or res2 is None:
            continue

        # Identify which is protein and which is sugar
        pairs = [(res1, atom1, res2, atom2), (res2, atom2, res1, atom1)]
        for prot_res, prot_atom_name, sug_res, _sug_atom_name in pairs:
            if (prot_res.resname in PROTEIN_RESNAMES and
                    sug_res.resname in CARBOHYDRATE_RESNAMES):
                _handle_glycan_link(
                    prot_res, prot_atom_name, sug_res,
                    protein_renames, protein_linked_sugars, log_lines
                )
                break

    # Distance-based fallback for protein-linked sugars not covered by a LINK
    # record (handles PDB files without LINK records, e.g. some deposited structures)
    for key, res in residues.items():
        if res.resname not in CARBOHYDRATE_RESNAMES:
            continue
        if key in protein_linked_sugars:
            continue  # already handled via LINK

        c1 = res.get_atom("C1")
        if c1 is None:
            continue

        c1_coords = (c1.x, c1.y, c1.z)
        for coords, chain_id, resseq, candidate_atom in atom_index:
            if candidate_atom.resname not in PROTEIN_RESNAMES:
                continue
            if _distance(c1_coords, coords) > BOND_THRESHOLD:
                continue

            prot_res = get_res(chain_id, resseq)
            if prot_res is None:
                continue

            _handle_glycan_link(
                prot_res, candidate_atom.name, res,
                protein_renames, protein_linked_sugars, log_lines
            )
            break

    # Assign the GLYCAM linkage-position prefix for every carbohydrate residue,
    # based on the full set of hydroxyls substituted by child sugars. This handles
    # branched sugars (e.g. a 3,6-linked core mannose → VMB) and protein-linked
    # reducing ends alike: a reducing-end sugar's name still reflects downstream
    # substitution (e.g. an O4-substituted N-linked GlcNAc → 4YB, not 0YB).
    for key, res in residues.items():
        if res.resname not in CARBOHYDRATE_RESNAMES:
            continue

        sugar_letter = SUGAR_LETTER.get(res.resname)
        if sugar_letter is None:
            log_lines.append(
                f"  WARNING: unknown sugar {res.resname} {res.chain_id}"
                f"{res.resseq:4d} — skipping GLYCAM rename"
            )
            continue

        positions = _find_child_linkage_positions(res, atom_index)
        prefix = _linkage_prefix(positions)
        is_alpha = _is_alpha_anomer(res)
        anomer = "A" if is_alpha else "B"
        glycam_name = f"{prefix}{sugar_letter}{anomer}"
        sugar_renames[key] = glycam_name

        if key in protein_linked_sugars:
            log_lines.append(
                f"  {res.resname} {res.chain_id}{res.resseq:4d} → {glycam_name} "
                f"({protein_linked_sugars[key]}, GLYCAM {glycam_name})"
            )
        else:
            branch = (
                "terminal" if not positions
                else "linkage at " + ", ".join(f"O{p}" for p in sorted(positions))
            )
            log_lines.append(
                f"  {res.resname} {res.chain_id}{res.resseq:4d} → {glycam_name} "
                f"({branch}, {'alpha' if is_alpha else 'beta'})"
            )

    # --- Apply renames to lines ---
    # Build a mapping from line_index → new 3-char resname
    line_rename: dict[int, str] = {}
    for key, new_name in {**protein_renames, **sugar_renames}.items():
        res = residues.get(key)
        if res is None:
            continue
        for atom in res.atoms:
            line_rename[atom.line_index] = new_name

    # Build atom-name remapping for residues whose PDB atom names differ from GLYCAM
    # (e.g. NAG C7→C2N, C8→CME, O7→O2N).  Keyed by line_index → new atom name.
    atom_rename: dict[int, str] = {}
    for key, res in residues.items():
        remap = _ATOM_NAME_REMAP.get(res.resname)
        if remap is None:
            continue
        for atom in res.atoms:
            new_atom_name = remap.get(atom.name)
            if new_atom_name is not None:
                atom_rename[atom.line_index] = new_atom_name

    new_lines = []
    for i, line in enumerate(lines):
        if i in line_rename:
            new_name = line_rename[i]
            # PDB columns 18-20 (0-indexed 17-19) hold the residue name, right-justified
            padded = new_name.ljust(3)[:3]
            line = line[:17] + padded + line[20:]
        if i in atom_rename:
            new_atom = atom_rename[i]
            # PDB columns 13-16 (0-indexed 12-15) hold the atom name, left-justified
            padded_atom = f" {new_atom:<3}" if len(new_atom) < 4 else new_atom[:4]
            line = line[:12] + padded_atom + line[16:]
        new_lines.append(line)

    return "".join(new_lines), log_lines


def _handle_glycan_link(
    prot_res: Residue,
    prot_atom_name: str,
    sug_res: Residue,
    protein_renames: dict,
    protein_linked_sugars: dict,
    log_lines: list,
) -> None:
    """Rename a glycosylated protein residue and mark the attached reducing-end sugar.

    Renames ASN→NLN, THR→OLT, SER→OLS and records the linked sugar in
    ``protein_linked_sugars``. The sugar's own GLYCAM name (including any
    downstream branch prefix) is assigned later in the unified naming pass, so
    that a reducing-end sugar substituted at, say, O4 is named 4YB rather than 0YB.
    """
    sugar_letter = SUGAR_LETTER.get(sug_res.resname)
    if sugar_letter is None:
        log_lines.append(
            f"  WARNING: unknown sugar {sug_res.resname} {sug_res.chain_id}"
            f"{sug_res.resseq:4d} — skipping GLYCAM rename"
        )
        return

    prot_key = prot_res.key
    sug_key = sug_res.key

    if prot_res.resname == "ASN" and prot_atom_name == "ND2":
        protein_renames[prot_key] = "NLN"
        protein_linked_sugars[sug_key] = "N-linked reducing end via ND2"
        log_lines.append(
            f"  ASN {prot_res.chain_id}{prot_res.resseq:4d} → NLN (N-linked via ND2)"
        )
    elif prot_res.resname == "THR" and prot_atom_name in ("OG1", "OG"):
        protein_renames[prot_key] = "OLT"
        protein_linked_sugars[sug_key] = "O-linked reducing end on Thr via OG1"
        log_lines.append(
            f"  THR {prot_res.chain_id}{prot_res.resseq:4d} → OLT (O-linked via OG1)"
        )
    elif prot_res.resname == "SER" and prot_atom_name == "OG":
        protein_renames[prot_key] = "OLS"
        protein_linked_sugars[sug_key] = "O-linked reducing end on Ser via OG"
        log_lines.append(
            f"  SER {prot_res.chain_id}{prot_res.resseq:4d} → OLS (O-linked via OG)"
        )


# GLYCAM linkage-position code (first character of a sugar residue name).
# The set lists which hydroxyl oxygens (O2/O3/O4/O6) of the sugar are substituted
# by a child (non-reducing) sugar's anomeric carbon. Mono-substituted sugars use
# the position digit; multiply-substituted (branched) sugars use a GLYCAM-06
# letter code. The sugar's own C1 (bond to its parent or the aglycon) is always
# implied and is not encoded here.
_LINKAGE_PREFIX: dict[frozenset[int], str] = {
    frozenset(): "0",
    frozenset({2}): "2",
    frozenset({3}): "3",
    frozenset({4}): "4",
    frozenset({6}): "6",
    frozenset({2, 3}): "Z",
    frozenset({2, 4}): "Y",
    frozenset({2, 6}): "X",
    frozenset({3, 4}): "W",
    frozenset({3, 6}): "V",
    frozenset({4, 6}): "U",
    frozenset({2, 3, 4}): "T",
    frozenset({2, 3, 6}): "S",
    frozenset({2, 4, 6}): "R",
    frozenset({3, 4, 6}): "Q",
    frozenset({2, 3, 4, 6}): "P",
}


def _linkage_prefix(positions: frozenset[int]) -> str:
    """Map a set of substituted oxygen positions to the GLYCAM residue prefix."""
    prefix = _LINKAGE_PREFIX.get(positions)
    if prefix is None:
        # Non-standard substitution pattern with no GLYCAM-06 code; fall back to
        # the lowest occupied position as a best effort.
        prefix = str(min(positions)) if positions else "0"
    return prefix


def _find_child_linkage_positions(
    res: Residue,
    atom_index: list,
) -> frozenset[int]:
    """Return the oxygen positions (2, 3, 4, 6) on this sugar bonded to another
    sugar's anomeric C1 — i.e. the positions where child sugars attach.

    An empty set denotes a non-reducing terminal sugar (prefix "0").
    """
    positions: set[int] = set()
    for on_name in ("O2", "O3", "O4", "O6"):
        on_atom = res.get_atom(on_name)
        if on_atom is None:
            continue
        on_coords = (on_atom.x, on_atom.y, on_atom.z)
        for coords, _chain_id, _resseq, candidate in atom_index:
            if candidate.resname not in CARBOHYDRATE_RESNAMES:
                continue
            if candidate.name != "C1":
                continue
            if (candidate.chain_id, candidate.resseq, candidate.icode) == (
                res.chain_id, res.resseq, res.icode
            ):
                continue
            if _distance(on_coords, coords) <= BOND_THRESHOLD:
                positions.add(int(on_name[1]))
                break
    return frozenset(positions)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _main() -> None:
    parser = argparse.ArgumentParser(description="Rename PDB residues to GLYCAM format.")
    parser.add_argument("pdb_file", help="Input PDB file")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--inplace", action="store_true",
                       help="Modify the PDB file in place (default)")
    group.add_argument("--output", metavar="OUT", help="Write to OUT instead of modifying in place")
    args = parser.parse_args()

    with open(args.pdb_file, encoding="utf-8") as f:
        pdb_text = f.read()

    modified_text, log_lines = rename_glycam_residues(pdb_text)

    out_path = args.output if args.output else args.pdb_file
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(modified_text)

    if log_lines:
        logger.info("GLYCAM renames applied:")
        for line in log_lines:
            logger.info(line)
    else:
        logger.info("No GLYCAM renames needed.")

    log_file = args.pdb_file.replace(".pdb", "_glycam_rename.log")
    with open(log_file, "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines) + "\n")


if __name__ == "__main__":
    _main()
