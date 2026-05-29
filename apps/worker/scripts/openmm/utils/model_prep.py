"""Structural preparation of a PDB for OpenMM energy minimization.

Handles both standard proteins and glycoproteins (GLYCAM force field).
The public entry point is prepare_modeller().
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from collections import defaultdict
from io import StringIO

from openmm.app import ForceField, Modeller, PDBFile
from pdbfixer import PDBFixer

from utils.glycam_rename import rename_glycam_residues
from utils.logger import get_logger

logger = get_logger("model_prep")


# ---------------------------------------------------------------------------
# GLYCAM protein residue helpers
# ---------------------------------------------------------------------------

_GLYCAM_PROTEIN_NAMES: frozenset[str] = frozenset({"NLN", "OLS", "OLT"})

# Backbone-integrated residues in CHARMM36 (charmm36_2024.xml) but absent from AMBER19.
# These must NOT be treated as standalone GAFF2 ligands — they are backbone residues.
# SEP=phosphoserine, TPO=phosphothreonine, PTR=phosphotyrosine,
# CYM=deprotonated cysteine, CYSP=phosphocysteine
_CHARMM36_BACKBONE_RESIDUES: frozenset[str] = frozenset({"SEP", "TPO", "PTR", "CYM", "CYSP"})

# CHARMM36 templates (charmm36_2024.xml) use CHARMM atom naming for phospho-residues:
# phosphate oxygens are O1P/O2P/O3P (not PDB standard OP1/OP2/OP3), and the
# backbone amide proton is HN (not PDB standard H). pdbNames.xml only maps OP1→O1P
# under the Nucleic context — protein-context residues like TPO/SEP/PTR get no alias.
# _rename_charmm36_atoms() normalises these before addHydrogens() is called.
#
# PDBFixer adds H atoms to TPO/SEP/PTR based on CCD data with wrong names:
# H/H2 (backbone NH), HOP2/HOP3 (protonated phosphate oxygens). These must be
# stripped and re-added with correct CHARMM36 names via _CHARMM36_FULL_H_DEFS.
_CHARMM36_PHOSPHATE_RENAMES: dict[str, str] = {"OP1": "O1P", "OP2": "O2P", "OP3": "O3P"}

# Full hydrogen definitions for CHARMM36 phospho-residues, derived directly from
# charmm36_2024.xml template bonds. Parents use CHARMM36 atom names (O3P not OP3).
_CHARMM36_FULL_H_DEFS: dict[str, list[tuple[str, str]]] = {
    "TPO": [("HN", "N"), ("HA", "CA"), ("HB", "CB"), ("HG21", "CG2"), ("HG22", "CG2"), ("HG23", "CG2"), ("H3T", "O3P")],
    "SEP": [("HN", "N"), ("HA", "CA"), ("HB1", "CB"), ("HB2", "CB"), ("H3T", "O3P")],
    "PTR": [("HN", "N"), ("HA", "CA"), ("HB1", "CB"), ("HB2", "CB"), ("HD1", "CD1"), ("HD2", "CD2"), ("HE1", "CE1"), ("HE2", "CE2"), ("H3T", "O3P")],
}

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
            logger.info(f"  Repaired bond: {label}")
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
# DNA/RNA 5'-terminal phosphate cleanup
# ---------------------------------------------------------------------------

_NUCLEIC_NAMES: frozenset[str] = frozenset({
    "DA", "DC", "DG", "DT",
    "A", "C", "G", "U", "RA", "RG", "RC", "RU",
})
_5PRIME_PHOSPHATE_ATOMS: frozenset[str] = frozenset({"P", "OP1", "OP2", "OP3"})


def _remove_5prime_terminal_phosphates(modeller: Modeller) -> None:
    """Remove spurious phosphate groups PDBFixer adds to 5' DNA/RNA termini.

    PDBFixer.addMissingAtoms() treats P/OP1/OP2 as "missing" on the first
    residue of a nucleic acid chain, creating a dangling phosphate that has
    no O3' from a preceding residue. OpenMM's template matcher cannot match
    the resulting external-bond pattern (e.g. matches DT3 internally but sees
    wrong external bonding), raising a ValueError inside addHydrogens().
    """
    atoms_to_delete = []
    for chain in modeller.topology.chains():
        residues = list(chain.residues())
        if not residues:
            continue
        first_res = residues[0]
        if first_res.name in _NUCLEIC_NAMES:
            for atom in first_res.atoms():
                if atom.name in _5PRIME_PHOSPHATE_ATOMS:
                    atoms_to_delete.append(atom)
    if atoms_to_delete:
        names = [a.name for a in atoms_to_delete]
        logger.info(f"  Removing {len(atoms_to_delete)} spurious 5'-terminal phosphate atom(s): {names}")
        modeller.delete(atoms_to_delete)


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

_METAL_ELEMENTS: frozenset[str] = frozenset([
    "FE", "ZN", "CU", "MN", "CO", "NI", "MG", "CA", "NA", "K",
    "MO", "W", "V", "CR", "RU", "RH", "PD", "AG", "CD", "PT", "AU", "HG",
])


def _has_metal_atoms(residue) -> bool:
    return any(
        a.element is not None and a.element.symbol.upper() in _METAL_ELEMENTS
        for a in residue.atoms()
    )


def _find_organic_ligand_sdfs(input_dir: str, unknown_resnames: list[str]) -> dict[str, str]:
    found = {}
    for name in unknown_resnames:
        path = os.path.join(input_dir, f"{name}.sdf")
        if os.path.exists(path):
            found[name] = path
        else:
            url = f"https://files.rcsb.org/ligands/download/{name}_ideal.sdf"
            logger.info(f"  No SDF for {name}, attempting download from RCSB...")
            try:
                urllib.request.urlretrieve(url, path)
                logger.info(f"  Downloaded {name}.sdf from RCSB.")
                found[name] = path
            except urllib.error.URLError as e:
                logger.warning(f"  Could not download {name}.sdf from RCSB ({e}). "
                               f"Residue will be removed.")
    return found


def _load_sdf_molecule(sdf_path: str) -> "Molecule":
    """Load first molecule from SDF with correct 3D dimensionality flag.

    RCSB ideal SDF files are sometimes tagged as 2D even though coordinates
    have non-zero Z values. Loading via RDKit first and calling Set3D(True)
    suppresses the RDKit warning before the OpenFF layer processes the mol.
    """
    from rdkit.Chem import SDMolSupplier
    from openff.toolkit import Molecule

    supplier = SDMolSupplier(sdf_path, removeHs=False, sanitize=True)
    rdmol = next(iter(supplier), None)
    if rdmol is None:
        raise ValueError(f"No molecule found in {sdf_path}")
    if rdmol.GetNumConformers() > 0:
        rdmol.GetConformer().Set3D(True)
    return Molecule.from_rdkit(rdmol, allow_undefined_stereo=True)


def _register_gaff_generator(forcefield: ForceField, sdf_map: dict[str, str]) -> set[str]:
    """Pre-generate GAFF2 templates for organic ligands and load them into the ForceField.

    Uses Gasteiger charges (milliseconds) instead of AM1-BCC/sqm (10-20 min).
    Templates are renamed from their canonical SMILES to the PDB residue name so that
    ForceField.addHydrogens() and createSystem() can find them by name.
    """
    from openmmforcefields.generators import GAFFTemplateGenerator
    from lxml import etree

    gaff_resnames: set[str] = set()
    for resname, sdf_path in sdf_map.items():
        try:
            mol = _load_sdf_molecule(sdf_path)
            mol.name = resname
            logger.info(f"  Loaded {resname} from {sdf_path} ({mol.n_atoms} atoms)")

            # Gasteiger charges: ~8ms via RDKit, no QM required
            mol.assign_partial_charges("gasteiger")

            # generate_residue_template runs antechamber for GAFF atom typing (~2-3s)
            gaff = GAFFTemplateGenerator(molecules=mol, forcefield="gaff-2.11")
            ffxml = gaff.generate_residue_template(mol)

            # The Residue name in the ffxml is the canonical SMILES; rename to PDB resname
            # so ForceField can match the residue by name during addHydrogens/createSystem.
            tree = etree.fromstring(ffxml.encode())
            for residue_elem in tree.iter("Residue"):
                residue_elem.set("name", resname)
            ffxml_renamed = etree.tostring(tree, encoding="unicode")

            forcefield.loadFile(StringIO(ffxml_renamed))
            gaff_resnames.add(resname)
            logger.info(f"  GAFF2 template for {resname} loaded (Gasteiger charges)")
        except Exception as e:
            logger.warning(f"  Could not parameterize {resname}: {e}")

    if gaff_resnames:
        logger.info(f"GAFF2 templates ready for: {sorted(gaff_resnames)}")

    return gaff_resnames


def _build_residue_heavy_graph(residue) -> tuple[list, dict[int, set[int]], dict[int, int]]:
    heavy_atoms = [
        atom for atom in residue.atoms()
        if atom.element is not None and atom.element.symbol != "H"
    ]
    local_index = {atom.index: i for i, atom in enumerate(heavy_atoms)}
    adjacency: dict[int, set[int]] = {i: set() for i in range(len(heavy_atoms))}
    existing_h_count: dict[int, int] = {i: 0 for i in range(len(heavy_atoms))}

    for atom1, atom2 in residue.internal_bonds():
        a1_is_h = atom1.element is not None and atom1.element.symbol == "H"
        a2_is_h = atom2.element is not None and atom2.element.symbol == "H"
        if not a1_is_h and not a2_is_h:
            if atom1.index in local_index and atom2.index in local_index:
                i = local_index[atom1.index]
                j = local_index[atom2.index]
                adjacency[i].add(j)
                adjacency[j].add(i)
        elif a1_is_h and not a2_is_h and atom2.index in local_index:
            existing_h_count[local_index[atom2.index]] += 1
        elif a2_is_h and not a1_is_h and atom1.index in local_index:
            existing_h_count[local_index[atom1.index]] += 1

    return heavy_atoms, adjacency, existing_h_count


def _build_molecule_heavy_graph(mol) -> tuple[list[int], dict[int, set[int]], dict[int, int]]:
    heavy_indices = [atom.molecule_atom_index for atom in mol.atoms if atom.atomic_number > 1]
    local_index = {mol_idx: i for i, mol_idx in enumerate(heavy_indices)}
    adjacency: dict[int, set[int]] = {i: set() for i in range(len(heavy_indices))}
    h_count: dict[int, int] = {i: 0 for i in range(len(heavy_indices))}

    for bond in mol.bonds:
        i = bond.atom1_index
        j = bond.atom2_index
        i_is_h = mol.atoms[i].atomic_number == 1
        j_is_h = mol.atoms[j].atomic_number == 1
        if not i_is_h and not j_is_h:
            ii = local_index[i]
            jj = local_index[j]
            adjacency[ii].add(jj)
            adjacency[jj].add(ii)
        elif i_is_h and not j_is_h:
            h_count[local_index[j]] += 1
        elif j_is_h and not i_is_h:
            h_count[local_index[i]] += 1

    return heavy_indices, adjacency, h_count


def _map_heavy_atoms(residue, mol) -> dict[int, int] | None:
    residue_heavy_atoms, residue_adj, _ = _build_residue_heavy_graph(residue)
    mol_heavy_indices, mol_adj, _ = _build_molecule_heavy_graph(mol)
    if len(residue_heavy_atoms) != len(mol_heavy_indices):
        return None

    residue_elem = [atom.element.atomic_number for atom in residue_heavy_atoms]
    mol_elem = [mol.atoms[idx].atomic_number for idx in mol_heavy_indices]

    candidates: dict[int, list[int]] = {}
    for r_i in range(len(residue_heavy_atoms)):
        r_deg = len(residue_adj[r_i])
        options = [
            m_i for m_i in range(len(mol_heavy_indices))
            if mol_elem[m_i] == residue_elem[r_i] and len(mol_adj[m_i]) == r_deg
        ]
        if not options:
            return None
        candidates[r_i] = options

    mapped_r_to_m: dict[int, int] = {}
    used_m: set[int] = set()

    def backtrack() -> bool:
        if len(mapped_r_to_m) == len(residue_heavy_atoms):
            return True

        r_i = min(
            (idx for idx in range(len(residue_heavy_atoms)) if idx not in mapped_r_to_m),
            key=lambda idx: len([m for m in candidates[idx] if m not in used_m]),
        )

        for m_i in candidates[r_i]:
            if m_i in used_m:
                continue
            consistent = True
            for r_j, mapped_m_j in mapped_r_to_m.items():
                if (r_j in residue_adj[r_i]) != (mapped_m_j in mol_adj[m_i]):
                    consistent = False
                    break
            if not consistent:
                continue
            mapped_r_to_m[r_i] = m_i
            used_m.add(m_i)
            if backtrack():
                return True
            used_m.remove(m_i)
            del mapped_r_to_m[r_i]
        return False

    if not backtrack():
        return None
    return mapped_r_to_m


def _build_charmm36_hydrogen_definitions(charmm36_resnames: frozenset[str]) -> str:
    """Generate a hydrogens.xml snippet for all H atoms in CHARMM36 phospho-residues."""
    root = ET.Element("Residues")
    for resname, defs in _CHARMM36_FULL_H_DEFS.items():
        if resname in charmm36_resnames:
            res_elem = ET.SubElement(root, "Residue", {"name": resname})
            for h_name, parent_name in defs:
                ET.SubElement(res_elem, "H", {"name": h_name, "parent": parent_name})
    return ET.tostring(root, encoding="unicode") if len(root) > 0 else ""


def _generate_ligand_hydrogen_definitions(modeller: Modeller, sdf_map: dict[str, str], gaff_resnames: set[str]) -> str:
    root = ET.Element("Residues")
    loaded_any = False

    residues_by_name: dict[str, list] = defaultdict(list)
    for residue in modeller.topology.residues():
        residues_by_name[residue.name].append(residue)

    for resname in sorted(gaff_resnames):
        sdf_path = sdf_map.get(resname)
        residue_candidates = residues_by_name.get(resname, [])
        if not sdf_path or not residue_candidates:
            continue

        residue = residue_candidates[0]
        try:
            mol = _load_sdf_molecule(sdf_path)
            mapping = _map_heavy_atoms(residue, mol)
            if mapping is None:
                logger.warning(f"  Could not map heavy-atom graph for {resname}; skipping ligand hydrogen definitions.")
                continue

            residue_heavy_atoms, _, existing_h = _build_residue_heavy_graph(residue)
            _, _, expected_h = _build_molecule_heavy_graph(mol)

            residue_elem = ET.SubElement(root, "Residue", {"name": resname})
            used_names = {atom.name for atom in residue.atoms()}
            for r_i, atom in enumerate(residue_heavy_atoms):
                expected = expected_h[mapping[r_i]]
                present = existing_h[r_i]
                total = max(expected, present)
                if total <= 0:
                    continue
                base = ("H" + atom.name).replace("'", "").replace("*", "")
                if not base:
                    base = "H"
                for n in range(1, total + 1):
                    h_name = f"{base}{n}" if total > 1 else base
                    while h_name in used_names:
                        h_name = f"{h_name}X"
                    used_names.add(h_name)
                    ET.SubElement(residue_elem, "H", {"name": h_name, "parent": atom.name})
            loaded_any = True
        except Exception as e:
            logger.warning(f"  Failed to prepare ligand hydrogen definitions for {resname}: {e}")

    if not loaded_any:
        return ""
    return ET.tostring(root, encoding="unicode")


def _remove_unknown_residues(
    modeller: Modeller,
    forcefield: ForceField,
    gaff_resnames: frozenset[str] = frozenset(),
) -> None:
    known_templates = set(forcefield._templates.keys())
    unknown = [
        res for res in modeller.topology.residues()
        if res.name not in known_templates
        and res.name not in _STANDARD_BIOMOL_NAMES
        and not _is_glycam_name(res.name)
        and res.name not in gaff_resnames
    ]
    if unknown:
        logger.warning(f"Removing {len(unknown)} residue(s) with no force field template:")
        for res in unknown:
            logger.warning(f"  {res.name} (chain {res.chain.id}, resSeq {res.id})")
        modeller.delete([atom for res in unknown for atom in res.atoms()])


def register_ligand_templates_for_topology(
    topology,
    forcefield: ForceField,
    input_dir: str,
) -> tuple[set[str], dict[str, str]]:
    """Register GAFF2 templates for unknown non-metal ligands present in `topology`."""
    known_templates = set(forcefield._templates.keys())
    unknown_organic_resnames = list({
        res.name for res in topology.residues()
        if res.name not in known_templates
        and res.name not in _STANDARD_BIOMOL_NAMES
        and not _is_glycam_name(res.name)
        and not _has_metal_atoms(res)
    })
    if not unknown_organic_resnames:
        return set(), {}

    logger.info(f"Unknown organic residues detected: {sorted(unknown_organic_resnames)}")
    sdf_map = _find_organic_ligand_sdfs(input_dir, unknown_organic_resnames)
    if not sdf_map:
        return set(), {}
    return _register_gaff_generator(forcefield, sdf_map), sdf_map


# ---------------------------------------------------------------------------
# CHARMM36 backbone bond repair
# ---------------------------------------------------------------------------

def _repair_backbone_bonds(topology, charmm36_resnames: frozenset[str]) -> int:
    """Add missing C(prev)→N and C→N(next) peptide bonds flanking CHARMM36 residues.

    OpenMM's PDB reader has no templates for non-standard residues (SEP, TPO,
    PTR, CYM, CYSP) at parse time — the CHARMM36 templates are only loaded later
    into the ForceField object. Without a template the inter-residue backbone
    bonds are never established. This function repairs them after the Modeller is
    created, mirroring _repair_glycam_protein_topology for GLYCAM residues.
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
            logger.info(f"  Repaired bond: {label}")
            added += 1

    for i, res in enumerate(res_list):
        if res.name not in charmm36_resnames:
            continue

        atom = {a.name: a for a in res.atoms()}

        # C(prev) → N(charmm36 residue)
        if i > 0:
            prev_res = res_list[i - 1]
            prev_C = next((a for a in prev_res.atoms() if a.name == "C"), None)
            _add_bond(prev_C, atom.get("N"),
                      f"{prev_res.name}[{prev_res.id}].C -- {res.name}[{res.id}].N")

        # C(charmm36 residue) → N(next)
        if i < len(res_list) - 1:
            next_res = res_list[i + 1]
            next_N = next((a for a in next_res.atoms() if a.name == "N"), None)
            _add_bond(atom.get("C"), next_N,
                      f"{res.name}[{res.id}].C -- {next_res.name}[{next_res.id}].N")

    return added


# ---------------------------------------------------------------------------
# CHARMM36 atom name normalisation and intra-residue bond repair
# ---------------------------------------------------------------------------

def _rename_charmm36_atoms(topology, charmm36_resnames: frozenset[str]) -> int:
    """Rename OP1/OP2/OP3 → O1P/O2P/O3P for CHARMM36 backbone residues.

    Must run before _add_charmm36_intra_bonds so bond lookup uses CHARMM36 names.
    """
    count = 0
    for res in topology.residues():
        if res.name not in charmm36_resnames:
            continue
        for atom in res.atoms():
            if atom.name in _CHARMM36_PHOSPHATE_RENAMES:
                atom.name = _CHARMM36_PHOSPHATE_RENAMES[atom.name]
                count += 1
    return count


def _add_charmm36_intra_bonds(
    topology,
    charmm36_resnames: frozenset[str],
    forcefield: ForceField,
) -> int:
    """Add missing intra-residue heavy-atom bonds for CHARMM36 backbone residues.

    PDBFixer does not add bonds within non-standard residues (TPO, SEP, PTR) because
    it has no templates for them at parse time. Reads expected bonds directly from the
    CHARMM36 ForceField templates and skips any bond where an atom is not yet present
    (H atoms are not in the topology yet and are added later by addHydrogens).
    """
    existing_bonds: set[tuple[int, int]] = set()
    for bond in topology.bonds():
        existing_bonds.add((bond[0].index, bond[1].index))
        existing_bonds.add((bond[1].index, bond[0].index))

    added = 0
    for res in topology.residues():
        if res.name not in charmm36_resnames:
            continue
        tmpl = forcefield._templates.get(res.name)
        if tmpl is None:
            continue
        atom_by_name = {a.name: a for a in res.atoms()}
        for bond in tmpl.bonds:
            a1_name = tmpl.atoms[bond[0]].name
            a2_name = tmpl.atoms[bond[1]].name
            if a1_name not in atom_by_name or a2_name not in atom_by_name:
                continue  # H atom not yet in topology
            a1 = atom_by_name[a1_name]
            a2 = atom_by_name[a2_name]
            if (a1.index, a2.index) not in existing_bonds:
                topology.addBond(a1, a2)
                existing_bonds.add((a1.index, a2.index))
                existing_bonds.add((a2.index, a1.index))
                added += 1
    return added


# ---------------------------------------------------------------------------
# Error surfacing
# ---------------------------------------------------------------------------

def _extract_template_error_info(error_msg: str) -> dict | None:
    """Parse 'No template found for residue N (NAME).' from an OpenMM ValueError."""
    m = re.search(r"No template found for residue (\d+) \((\w+)\)", error_msg)
    if m:
        return {"residue_index": int(m.group(1)), "residue_name": m.group(2)}
    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def prepare_modeller(
    initial_pdb_file: str,
    config: dict,
    forcefield: ForceField,
) -> Modeller:
    """Load, fix, and hydrogenate a PDB into an OpenMM Modeller.

    Handles standard proteins, glycoproteins (has_carbohydrates), and proteins
    with CHARMM36 backbone residues (has_charmm36_residues). Returns a Modeller
    ready for forcefield.createSystem().
    """
    has_carbohydrates = config["input"].get("has_carbohydrates", False)
    has_charmm36_residues = config["input"].get("has_charmm36_residues", False)
    charmm36_resnames: frozenset[str] = _CHARMM36_BACKBONE_RESIDUES if has_charmm36_residues else frozenset()

    with open(initial_pdb_file, "r", encoding="utf-8") as f:
        raw_pdb = f.read()

    if has_carbohydrates:
        # Fix missing residues/atoms on the original PDB BEFORE GLYCAM renaming.
        # GLYCAM names (NLN, OLS, OLT, 0MA, 0NB, etc.) are unknown to PDBFixer's
        # sequence aligner, causing findMissingResidues() to return {} even when
        # chain gaps exist. Running PDBFixer first on standard names ensures gaps
        # (e.g. missing loops) are correctly detected and repaired.
        logger.info("Glycoprotein mode: running PDBFixer on original PDB to fix chain gaps...")
        pre_fixer = PDBFixer(pdbfile=StringIO(_normalize_charmm_nucleic_names(raw_pdb)))
        pre_fixer.findMissingResidues()
        logger.info(f"Missing residues found by PDBFixer: {pre_fixer.missingResidues}")
        pre_fixer.findNonstandardResidues()
        if pre_fixer.nonstandardResidues:
            truly_nonstandard = [(r, s) for r, s in pre_fixer.nonstandardResidues if r.name != s]
            if truly_nonstandard:
                logger.info("Replacing nonstandard residues with standard equivalents:")
                for r, s in truly_nonstandard:
                    logger.info(f"  {r.name} → {s}")
                pre_fixer.nonstandardResidues = truly_nonstandard
                pre_fixer.replaceNonstandardResidues()
        pre_fixer.findMissingAtoms()
        pre_fixer.addMissingAtoms()
        # Add hydrogens while residues still have standard/CCD-recognized names.
        # This is especially important for organic cofactors/ligands (e.g., FAD):
        # GAFF templates are explicit-H, so leaving ligands dehydrogenated here
        # causes later ForceField matching failures inside Modeller.addHydrogens().
        #
        # We intentionally do this *before* GLYCAM renaming, because GLYCAM residue
        # names can trigger problematic CCD fetch/parse paths in PDBFixer.
        pre_fixer.addMissingHydrogens(pH=7.0)
        fixed_pdb_io = StringIO()
        PDBFile.writeFile(pre_fixer.topology, pre_fixer.positions, fixed_pdb_io, keepIds=True)
        fixed_pdb_text = fixed_pdb_io.getvalue()

        logger.info("Glycoprotein mode: applying GLYCAM residue renaming to fixed PDB...")
        renamed_pdb, glycam_log = rename_glycam_residues(fixed_pdb_text)
        log_path = os.path.join(config["input"]["dir"], "glycam_rename.log")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(glycam_log) + "\n")
        logger.info(f"GLYCAM rename log written to {log_path}")
        for line in glycam_log:
            logger.info(line)

        fixer = PDBFixer(pdbfile=StringIO(renamed_pdb))
        fixer.findNonstandardResidues()
        if fixer.nonstandardResidues:
            logger.info("Nonstandard residues found (GLYCAM names expected here, not replaced):")
            for residue in fixer.nonstandardResidues:
                logger.info(f" - {residue}")
        # OpenMM's PDB reader doesn't establish C→N backbone bonds when the destination
        # residue is a GLYCAM protein residue (NLN, OLS, OLT) unknown to its templates.
        n_repaired = _repair_glycam_protein_topology(fixer.topology)
        if n_repaired:
            logger.info(f"Repaired {n_repaired} missing bond(s) for GLYCAM protein residues.")
        # Skip addMissingHydrogens: it triggers CCD downloads for GLYCAM residue names
        # whose mmCIF entries contain '?' coordinates that PDBFixer cannot parse.
        # Hydrogens are added below via modeller.addHydrogens() using GLYCAM_06j-1.xml.
        logger.info("Glycoprotein mode: skipping PDBFixer.addMissingHydrogens() to avoid GLYCAM CCD downloads.")
    else:
        normalized_pdb = _normalize_charmm_nucleic_names(raw_pdb)
        fixer = PDBFixer(pdbfile=StringIO(normalized_pdb))
        fixer.findMissingResidues()
        fixer.findNonstandardResidues()
        if fixer.nonstandardResidues:
            logger.info("Nonstandard residues found:")
            for residue in fixer.nonstandardResidues:
                logger.info(f" - {residue}")
        else:
            logger.info("No nonstandard residues found.")
        fixer.findMissingAtoms()
        fixer.addMissingAtoms()
        fixer.addMissingHydrogens(pH=7.0)

    modeller = Modeller(fixer.topology, fixer.positions)

    # Repair missing C(prev)→N and C→N(next) peptide bonds flanking CHARMM36 residues.
    # The PDB reader has no templates for these non-standard residues at parse time,
    # so inter-residue backbone bonds are not established — same issue as GLYCAM.
    if charmm36_resnames:
        n_repaired = _repair_backbone_bonds(modeller.topology, charmm36_resnames)
        if n_repaired:
            logger.info(f"Repaired {n_repaired} missing backbone bond(s) for CHARMM36 residues.")
        # Normalise phosphate oxygen names (OP1/OP2/OP3 → O1P/O2P/O3P) to match
        # the CHARMM36 template. pdbNames.xml only has this alias for Nucleic residues.
        n_renamed = _rename_charmm36_atoms(modeller.topology, charmm36_resnames)
        if n_renamed:
            logger.info(f"Renamed {n_renamed} phosphate oxygen atom(s) to CHARMM36 convention.")
        # Add intra-residue heavy-atom bonds from the CHARMM36 templates. PDBFixer
        # leaves non-standard residues unconnected internally; without these bonds
        # the graph-based template matcher in createSystem cannot match TPO/SEP/PTR.
        n_bonds = _add_charmm36_intra_bonds(modeller.topology, charmm36_resnames, forcefield)
        if n_bonds:
            logger.info(f"Added {n_bonds} intra-residue bond(s) for CHARMM36 residues.")

    # PDBFixer.addMissingAtoms() incorrectly adds P/OP1/OP2 to the 5' terminus
    # of DNA/RNA chains. Strip them before addHydrogens() to avoid template mismatch.
    _remove_5prime_terminal_phosphates(modeller)

    # Identify unknown residues that are organic (no metals) and have an SDF file,
    # then register a GAFF2 template generator for them before deletion runs.
    gaff_resnames, sdf_map = register_ligand_templates_for_topology(
        modeller.topology,
        forcefield,
        config["input"]["dir"],
    )

    _remove_unknown_residues(modeller, forcefield, frozenset(gaff_resnames))

    # Add hydrogen definitions for GAFF residues so Modeller.addHydrogens() can
    # fill in missing ligand H atoms before force-field matching.
    if gaff_resnames and sdf_map:
        ligand_h_xml = _generate_ligand_hydrogen_definitions(modeller, sdf_map, gaff_resnames)
        if ligand_h_xml:
            Modeller.loadHydrogenDefinitions(StringIO(ligand_h_xml))

    # In glycoprotein mode we skip PDBFixer.addMissingHydrogens(), so there is no
    # partial-hydrogenation problem: any H atoms present are from the original PDB or
    # pre_fixer's addMissingAtoms(). Stripping them would break GLYCAM template matching
    # (OLS/OLT/NLN templates require H atoms to be present when createSystem is called
    # internally by addHydrogens). In non-glycoprotein mode, strip first to fix the
    # DNA/RNA partial-hydrogenation issue from PDBFixer.addMissingHydrogens().
    # GAFF2 templates are explicit-H: createSystem() (called internally by
    # addHydrogens) needs H atoms present to match the template. Keep them.
    # CHARMM36 backbone residues (SEP/TPO/PTR/CYM/CYSP): PDBFixer adds CCD-based H
    # atoms with wrong names (H/H2 for backbone NH, HOP2/HOP3 for phosphate OH).
    # Strip them here; _build_charmm36_hydrogen_definitions() defines the correct
    # CHARMM36-named replacements (HN, H3T, HA, HB, …) added by addHydrogens below.
    h_atoms = [
        atom
        for atom in modeller.topology.atoms()
        if atom.element is not None
        and atom.element.symbol == "H"
        and atom.residue.name not in gaff_resnames
    ]
    modeller.delete(h_atoms)

    # glycam-hydrogens.xml defines which H atoms to add for GLYCAM residues (OLS, OLT, NLN,
    # and all sugar codes). Without loading it, addHydrogens() skips those residues and the
    # subsequent createSystem() call fails because the GLYCAM templates require H atoms.
    if has_carbohydrates:
        Modeller.loadHydrogenDefinitions("glycam-hydrogens.xml")

    # hydrogens.xml has no entries for SEP/TPO/PTR. Load full custom definitions
    # (all backbone and sidechain H atoms, including H3T) so addHydrogens() can
    # re-add the correct CHARMM36-named H atoms that were stripped above.
    if charmm36_resnames:
        charmm36_h_xml = _build_charmm36_hydrogen_definitions(charmm36_resnames)
        if charmm36_h_xml:
            Modeller.loadHydrogenDefinitions(StringIO(charmm36_h_xml))

    try:
        modeller.addHydrogens(forcefield, pH=7.0)
    except ValueError as e:
        info = _extract_template_error_info(str(e))
        if info:
            logger.info(f"BILBOMD_OPENMM_ERROR: {json.dumps({**info, 'message': str(e)})}")
        raise

    return modeller
