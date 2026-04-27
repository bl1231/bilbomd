"""Structural preparation of a PDB for OpenMM energy minimization.

Handles both standard proteins and glycoproteins (GLYCAM force field).
The public entry point is prepare_modeller().
"""

from __future__ import annotations

import os
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
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
            print(f"  No SDF for {name}, attempting download from RCSB...")
            try:
                urllib.request.urlretrieve(url, path)
                print(f"  Downloaded {name}.sdf from RCSB.")
                found[name] = path
            except urllib.error.URLError as e:
                print(f"  Warning: could not download {name}.sdf from RCSB ({e}). "
                      f"Residue will be removed.")
    return found


def _register_gaff_generator(forcefield: ForceField, sdf_map: dict[str, str]) -> set[str]:
    """Pre-generate GAFF2 templates for organic ligands and load them into the ForceField.

    Uses Gasteiger charges (milliseconds) instead of AM1-BCC/sqm (10-20 min).
    Templates are renamed from their canonical SMILES to the PDB residue name so that
    ForceField.addHydrogens() and createSystem() can find them by name.
    """
    from openff.toolkit import Molecule
    from openmmforcefields.generators import GAFFTemplateGenerator
    from lxml import etree

    gaff_resnames: set[str] = set()
    for resname, sdf_path in sdf_map.items():
        try:
            mol = Molecule.from_file(sdf_path, allow_undefined_stereo=True)
            mol.name = resname
            print(f"  Loaded {resname} from {sdf_path} ({mol.n_atoms} atoms)")

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
            print(f"  GAFF2 template for {resname} loaded (Gasteiger charges)")
        except Exception as e:
            print(f"  Warning: could not parameterize {resname}: {e}")

    if gaff_resnames:
        print(f"GAFF2 templates ready for: {sorted(gaff_resnames)}")

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


def _generate_ligand_hydrogen_definitions(modeller: Modeller, sdf_map: dict[str, str], gaff_resnames: set[str]) -> str:
    from openff.toolkit import Molecule

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
            mol = Molecule.from_file(sdf_path, allow_undefined_stereo=True)
            mapping = _map_heavy_atoms(residue, mol)
            if mapping is None:
                print(f"  Warning: could not map heavy-atom graph for {resname}; skipping ligand hydrogen definitions.")
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
            print(f"  Warning: failed to prepare ligand hydrogen definitions for {resname}: {e}")

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
        # Add hydrogens while residues still have standard/CCD-recognized names.
        # This is especially important for organic cofactors/ligands (e.g., FAD):
        # GAFF templates are explicit-H, so leaving ligands dehydrogenated here
        # causes later ForceField matching failures inside Modeller.addHydrogens().
        #
        # We intentionally do this *before* GLYCAM renaming, because GLYCAM residue
        # names can trigger problematic CCD fetch/parse paths in PDBFixer.
        pre_fixer.addMissingHydrogens(pH=7.0)
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

    # Identify unknown residues that are organic (no metals) and have an SDF file,
    # then register a GAFF2 template generator for them before deletion runs.
    known_templates = set(forcefield._templates.keys())
    unknown_organic_resnames = list({
        res.name for res in modeller.topology.residues()
        if res.name not in known_templates
        and res.name not in _STANDARD_BIOMOL_NAMES
        and not _is_glycam_name(res.name)
        and not _has_metal_atoms(res)
    })
    if unknown_organic_resnames:
        print(f"Unknown organic residues detected: {sorted(unknown_organic_resnames)}")
        sdf_map = _find_organic_ligand_sdfs(config["input"]["dir"], unknown_organic_resnames)
        gaff_resnames = _register_gaff_generator(forcefield, sdf_map) if sdf_map else set()
    else:
        sdf_map = {}
        gaff_resnames = set()

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
    modeller.addHydrogens(forcefield, pH=7.0)

    return modeller
