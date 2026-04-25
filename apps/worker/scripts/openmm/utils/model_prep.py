"""Structural preparation of a PDB for OpenMM energy minimization.

Handles both standard proteins and glycoproteins (GLYCAM force field).
The public entry point is prepare_modeller().
"""

from __future__ import annotations

import os
from collections import defaultdict
from io import StringIO

from openmm.app import ForceField, Modeller, PDBFile
from pdbfixer import PDBFixer

from utils.glycam_rename import rename_glycam_residues


# ---------------------------------------------------------------------------
# GLYCAM protein residue helpers
# ---------------------------------------------------------------------------

_GLYCAM_PROTEIN_NAMES: frozenset[str] = frozenset({"NLN", "OLS", "OLT"})

# Heavy-atom intra-residue bonds for each GLYCAM protein residue.
# These are missing because ATOM-record residues unknown to OpenMM's PDB reader
# receive no template-based bonding and no distance-based bonding fallback.
_GLYCAM_PROTEIN_BONDS: dict[str, list[tuple[str, str]]] = {
    "OLS": [("N", "CA"), ("CA", "C"), ("CA", "CB"), ("CB", "OG"), ("C", "O")],
    "OLT": [("N", "CA"), ("CA", "C"), ("CA", "CB"), ("CB", "OG1"), ("CB", "CG2"), ("C", "O")],
    "NLN": [("N", "CA"), ("CA", "C"), ("CA", "CB"), ("CB", "CG"), ("CG", "OD1"), ("CG", "ND2"), ("C", "O")],
}


def _is_glycam_name(name: str) -> bool:
    return name in _GLYCAM_PROTEIN_NAMES or (len(name) == 3 and name[0].isdigit())


def _repair_glycam_protein_topology(topology) -> int:
    """Add missing bonds for GLYCAM protein residues (NLN, OLS, OLT).

    OpenMM's PDB reader leaves these residues with no intra-residue bonds
    (ATOM records for unknown residues get neither template-based nor
    distance-based bonding). The inter-residue backbone bond C(prev)→N is also
    missing because the preceding standard residue's template doesn't know to
    bond to an unknown following residue. Both types of bond are repaired here.
    Returns the total number of bonds added.
    """
    res_list = list(topology.residues())
    existing_bonds: set[tuple[int, int]] = set()
    for bond in topology.bonds():
        existing_bonds.add((bond[0].index, bond[1].index))
        existing_bonds.add((bond[1].index, bond[0].index))

    added = 0

    def _add_bond(a1, a2, label):
        nonlocal added
        if a1 and a2 and (a1.index, a2.index) not in existing_bonds:
            topology.addBond(a1, a2)
            existing_bonds.add((a1.index, a2.index))
            existing_bonds.add((a2.index, a1.index))
            print(f"  Repaired bond: {label}")
            added += 1

    for i, res in enumerate(res_list):
        if res.name not in _GLYCAM_PROTEIN_NAMES:
            continue

        atom = {a.name: a for a in res.atoms()}

        for a1_name, a2_name in _GLYCAM_PROTEIN_BONDS.get(res.name, []):
            _add_bond(atom.get(a1_name), atom.get(a2_name),
                      f"{res.name}[{res.id}].{a1_name} -- {res.name}[{res.id}].{a2_name}")

        if i > 0:
            prev_res = res_list[i - 1]
            prev_C = next((a for a in prev_res.atoms() if a.name == "C"), None)
            _add_bond(prev_C, atom.get("N"),
                      f"{prev_res.name}[{prev_res.id}].C -- {res.name}[{res.id}].N")

    return added


# ---------------------------------------------------------------------------
# CHARMM DNA name normalisation
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Unknown residue removal
# ---------------------------------------------------------------------------

_STANDARD_BIOMOL_NAMES = frozenset([
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS",
    "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
    "HID", "HIE", "HIP", "HSD", "HSE", "CYX", "ACE", "NME", "NHE",
    "DA", "DG", "DC", "DT", "A", "G", "C", "U", "RA", "RG", "RC", "RU",
    "HOH", "WAT", "TIP",
])


def _remove_unknown_residues(modeller: Modeller, forcefield: ForceField) -> None:
    known_templates = set(forcefield._templates.keys())
    unknown = [
        res for res in modeller.topology.residues()
        if res.name not in known_templates
        and res.name not in _STANDARD_BIOMOL_NAMES
        and not _is_glycam_name(res.name)
    ]
    if unknown:
        print(f"Warning: removing {len(unknown)} residue(s) with no force field template:")
        for res in unknown:
            print(f"  {res.name} (chain {res.chain.id}, resSeq {res.id})")
        modeller.delete([atom for res in unknown for atom in res.atoms()])


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def prepare_modeller(
    initial_pdb_file: str,
    config: dict,
    forcefield: ForceField,
) -> Modeller:
    """Load, fix, and hydrogenate a PDB into an OpenMM Modeller.

    Handles both standard proteins and glycoproteins (has_carbohydrates flag
    in config["input"]). Returns a Modeller ready for forcefield.createSystem().
    """
    has_carbohydrates = config["input"].get("has_carbohydrates", False)

    with open(initial_pdb_file, "r", encoding="utf-8") as f:
        raw_pdb = f.read()

    if has_carbohydrates:
        # Fix missing residues/atoms on the original PDB BEFORE GLYCAM renaming.
        # GLYCAM names (NLN, OLS, OLT, 0MA, 0NB, etc.) are unknown to PDBFixer's
        # sequence aligner, causing findMissingResidues() to return {} even when
        # chain gaps exist. Running PDBFixer first on standard names ensures gaps
        # (e.g. missing loops) are correctly detected and repaired.
        print("Glycoprotein mode: running PDBFixer on original PDB to fix chain gaps...")
        pre_fixer = PDBFixer(pdbfile=StringIO(_normalize_charmm_nucleic_names(raw_pdb)))
        pre_fixer.findMissingResidues()
        print(f"Missing residues found by PDBFixer: {pre_fixer.missingResidues}")
        pre_fixer.findNonstandardResidues()
        if pre_fixer.nonstandardResidues:
            truly_nonstandard = [(r, s) for r, s in pre_fixer.nonstandardResidues if r.name != s]
            if truly_nonstandard:
                print("Replacing nonstandard residues with standard equivalents:")
                for r, s in truly_nonstandard:
                    print(f"  {r.name} → {s}")
                pre_fixer.nonstandardResidues = truly_nonstandard
                pre_fixer.replaceNonstandardResidues()
        pre_fixer.findMissingAtoms()
        pre_fixer.addMissingAtoms()
        fixed_pdb_io = StringIO()
        PDBFile.writeFile(pre_fixer.topology, pre_fixer.positions, fixed_pdb_io)
        fixed_pdb_text = fixed_pdb_io.getvalue()

        print("Glycoprotein mode: applying GLYCAM residue renaming to fixed PDB...")
        renamed_pdb, glycam_log = rename_glycam_residues(fixed_pdb_text)
        log_path = os.path.join(config["input"]["dir"], "glycam_rename.log")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(glycam_log) + "\n")
        print(f"GLYCAM rename log written to {log_path}")
        for line in glycam_log:
            print(line)

        fixer = PDBFixer(pdbfile=StringIO(renamed_pdb))
        fixer.findNonstandardResidues()
        if fixer.nonstandardResidues:
            print("Nonstandard residues found (GLYCAM names expected here, not replaced):")
            for residue in fixer.nonstandardResidues:
                print(f" - {residue}")
        # OpenMM's PDB reader doesn't establish C→N backbone bonds when the destination
        # residue is a GLYCAM protein residue (NLN, OLS, OLT) unknown to its templates.
        n_repaired = _repair_glycam_protein_topology(fixer.topology)
        if n_repaired:
            print(f"Repaired {n_repaired} missing bond(s) for GLYCAM protein residues.")
        # Skip addMissingHydrogens: it triggers CCD downloads for GLYCAM residue names
        # whose mmCIF entries contain '?' coordinates that PDBFixer cannot parse.
        # Hydrogens are added below via modeller.addHydrogens() using GLYCAM_06j-1.xml.
        print("Glycoprotein mode: skipping PDBFixer.addMissingHydrogens() to avoid GLYCAM CCD downloads.")
    else:
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
        fixer.findMissingAtoms()
        fixer.addMissingAtoms()
        fixer.addMissingHydrogens(pH=7.0)

    modeller = Modeller(fixer.topology, fixer.positions)

    _remove_unknown_residues(modeller, forcefield)

    # In glycoprotein mode we skip PDBFixer.addMissingHydrogens(), so there is no
    # partial-hydrogenation problem: any H atoms present are from the original PDB or
    # pre_fixer's addMissingAtoms(). Stripping them would break GLYCAM template matching
    # (OLS/OLT/NLN templates require H atoms to be present when createSystem is called
    # internally by addHydrogens). In non-glycoprotein mode, strip first to fix the
    # DNA/RNA partial-hydrogenation issue from PDBFixer.addMissingHydrogens().
    h_atoms = [
        atom
        for atom in modeller.topology.atoms()
        if atom.element is not None and atom.element.symbol == "H"
    ]
    modeller.delete(h_atoms)

    # glycam-hydrogens.xml defines which H atoms to add for GLYCAM residues (OLS, OLT, NLN,
    # and all sugar codes). Without loading it, addHydrogens() skips those residues and the
    # subsequent createSystem() call fails because the GLYCAM templates require H atoms.
    if has_carbohydrates:
        Modeller.loadHydrogenDefinitions("glycam-hydrogens.xml")
    modeller.addHydrogens(forcefield, pH=7.0)

    return modeller
