"""
Description: This script calculates the molecular weight of a PDB file.
Also contains shared utilities for PDB processing in BilboMD.
"""

from Bio.PDB import MMCIFParser

# Standard atomic weights (Da). Covers biomolecules plus the ions and
# heteroatoms that turn up in structures submitted to BilboMD.
ATOMIC_WEIGHTS = {
    "H": 1.008,
    "C": 12.011,
    "N": 14.007,
    "O": 15.999,
    "P": 30.974,
    "S": 32.06,
    "F": 18.998,
    "NA": 22.990,
    "MG": 24.305,
    "CL": 35.45,
    "K": 39.098,
    "CA": 40.078,
    "MN": 54.938,
    "FE": 55.845,
    "CO": 58.933,
    "NI": 58.693,
    "CU": 63.546,
    "ZN": 65.38,
    "SE": 78.971,
    "BR": 79.904,
    "I": 126.904,
}

# Elements that make up proteins, nucleic acids and sugars. When an atom name
# is ambiguous ("CA" is a carbon in a residue but calcium as an ion), these
# win inside a recognised residue.
_BIOPOLYMER_ELEMENTS = frozenset("HCNOPS")

# Residue names classify_residue() does not know: CHARMM/AMBER protonation
# variants and CHARMM uracil. Used only for mass bookkeeping.
_EXTRA_PROTEIN_RESIDUES = frozenset(
    ["HSD", "HSE", "HSP", "HID", "HIE", "HIP", "MSE", "CYX", "CYM", "ASH", "GLH", "LYN"]
)
_EXTRA_NUCLEIC_RESIDUES = frozenset(["URA", "DU"])
_WATER_RESIDUES = frozenset(["HOH", "WAT", "TIP3", "TIP", "SOL", "H2O", "DOD"])


def _residue_class(resname):
    """'protein', 'nucleic', 'water' or 'other' for a residue name."""
    if resname in _WATER_RESIDUES:
        return "water"
    if resname in _EXTRA_PROTEIN_RESIDUES:
        return "protein"
    if resname in _EXTRA_NUCLEIC_RESIDUES:
        return "nucleic"
    mol_type = classify_residue(resname)
    if mol_type == "PRO":
        return "protein"
    if mol_type in ("DNA", "RNA"):
        return "nucleic"
    return "other"


def _atom_element(line, residue_class):
    """
    Element symbol for an ATOM/HETATM line, or None if it cannot be determined.

    Uses the element column (77-78) when present. CHARMM-written PDBs leave it
    blank, so otherwise the element is taken from the atom name.
    """
    element = line[76:78].strip().upper()
    if element in ATOMIC_WEIGHTS:
        return element

    name_field = line[12:16]
    letters = "".join(ch for ch in name_field.strip().upper() if ch.isalpha())
    if not letters:
        return None
    one, two = letters[0], letters[:2]

    # Inside a protein or nucleic acid residue every atom is H, C, N, O, P or S,
    # whatever its name looks like (CA, HG, NE, CD ...).
    if residue_class in ("protein", "nucleic"):
        return one if one in ATOMIC_WEIGHTS else None

    # Ions and ligands: a two-letter element is written left-justified in the
    # name field, or the residue is named after it (residue MG, atom MG).
    resname = line[17:21].strip().upper()
    if len(two) == 2 and two in ATOMIC_WEIGHTS:
        if name_field[0].isalpha() and len(name_field.strip()) <= 2:
            return two
        if resname.startswith(two):
            return two
    if one in _BIOPOLYMER_ELEMENTS:
        return one
    if len(two) == 2 and two in ATOMIC_WEIGHTS:
        return two
    return one if one in ATOMIC_WEIGHTS else None


def molecular_composition(pdb_file):
    """
    Mass of a PDB file's first model, split by molecule type.

    Reads ATOM/HETATM lines directly rather than building a Biopython
    structure: CHARMM-style files reuse a chain letter and residue numbers for
    different segments (PROA and DNAA are both chain A), and Biopython drops
    the second segment's residues as duplicates. Water is not counted, and a
    residue modelled in alternate conformations is counted once: the first
    conformer in the file.

    Returns a dict with total_da, protein_da, nucleic_da, other_da, n_atoms and
    unknown_atoms (atoms whose element could not be determined; they add no
    mass).
    """
    masses = {"protein": 0.0, "nucleic": 0.0, "other": 0.0}
    n_atoms = 0
    unknown_atoms = 0
    # The alternate-location id counted for each residue, keyed by segment,
    # chain and residue number so same-numbered residues in different segments
    # stay separate.
    conformer = {}

    with open(pdb_file, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("ENDMDL"):
                break
            if not line.startswith(("ATOM", "HETATM")):
                continue
            residue_class = _residue_class(line[17:21].strip().upper())
            if residue_class == "water":
                continue
            altloc = line[16]
            if altloc != " ":
                residue = (line[72:76], line[21], line[22:27])
                if conformer.setdefault(residue, altloc) != altloc:
                    continue
            n_atoms += 1
            element = _atom_element(line, residue_class)
            if element is None:
                unknown_atoms += 1
                continue
            masses[residue_class] += ATOMIC_WEIGHTS[element]

    if n_atoms == 0:
        raise ValueError(f"No atoms found in PDB file: {pdb_file}")

    return {
        "total_da": sum(masses.values()),
        "protein_da": masses["protein"],
        "nucleic_da": masses["nucleic"],
        "other_da": masses["other"],
        "n_atoms": n_atoms,
        "unknown_atoms": unknown_atoms,
    }


def calculate_molecular_weight(pdb_file):
    """Molecular weight (Da) of the first model in a PDB file, without water."""
    return molecular_composition(pdb_file)["total_da"]


def classify_residue(residue):
    """
    Classify a residue name into molecule type.
    """
    protein_residues = set(
        [
            "ALA",
            "CYS",
            "ASP",
            "GLU",
            "PHE",
            "GLY",
            "HIS",
            "ILE",
            "LYS",
            "LEU",
            "MET",
            "ASN",
            "PRO",
            "GLN",
            "ARG",
            "SER",
            "THR",
            "VAL",
            "TRP",
            "TYR",
            "SEP",
            "TPO",
            "PTR",
        ]
    )
    dna_residues = set(["DA", "DC", "DG", "DT", "DI", "ADE", "CYT", "GUA", "THY"])
    rna_residues = set(["A", "C", "G", "U", "I"])
    carbohydrate_residues = set(
        [
            "AFL",
            "ALL",
            "BMA",
            "BGC",
            "BOG",
            "FCA",
            "FCB",
            "FMF",
            "FUC",
            "FUL",
            "G4S",
            "GAL",
            "GLA",
            "GLB",
            "GLC",
            "GLS",
            "GSA",
            "LAK",
            "LAT",
            "MAF",
            "MAL",
            "NAG",
            "NAN",
            "NGA",
            "SIA",
            "SLB",
        ]
    )

    if residue in protein_residues:
        return "PRO"
    elif residue in dna_residues:
        return "DNA"
    elif residue in rna_residues:
        return "RNA"
    elif residue in carbohydrate_residues:
        return "CAR"
    else:
        return "UNKNOWN"


def determine_molecule_type_details(lines):
    """
    Returns a dictionary with molecule type info for the chain.
    """
    types_present = set()
    residue_types = []

    for line in lines:
        if line.startswith(("ATOM", "HETATM")):
            residue = line[17:20].strip()
            mol_type = classify_residue(residue)
            types_present.add(mol_type)
            residue_types.append(mol_type)

    return {
        "types_present": types_present,
        "first_residue_type": residue_types[0] if residue_types else "UNKNOWN",
        "last_residue_type": residue_types[-1] if residue_types else "UNKNOWN",
    }


def get_segid_renaming_map(pdb_file: str) -> dict:
    """
    Build a mapping from original chain ID (segid) to renamed segid as per pdb2crd.py logic.
    """
    chains = {}
    with open(pdb_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith(("ATOM", "HETATM")):
                chain_id = line[21].strip() or " "
                if chain_id not in chains:
                    chains[chain_id] = []
                chains[chain_id].append(line)

    renaming = {}
    for chain_id, lines in chains.items():
        molinfo = determine_molecule_type_details(lines)
        types_present = molinfo.get("types_present", set())
        mol_type = (
            "PRO" if types_present == {"PRO"} else next(iter(types_present), "UNKNOWN")
        )
        renaming[chain_id] = f"{mol_type}{chain_id}"

    return renaming


def get_segid_renaming_map_from_cif(cif_file: str) -> dict:
    """
    Build a mapping from chain ID to renamed segid (as per pdb2crd.py logic)
    for an mmCIF file. Uses biopython to parse chain/residue info.
    """
    parser = MMCIFParser(QUIET=True)
    structure = parser.get_structure("s", cif_file)
    renaming = {}
    for model in structure:
        for chain in model:
            chain_id = chain.id
            if chain_id in renaming:
                continue
            res_types = set()
            for residue in chain:
                mol_type = classify_residue(residue.resname.strip())
                res_types.add(mol_type)
            mol_type = (
                "PRO" if res_types == {"PRO"} else next(iter(res_types), "UNKNOWN")
            )
            renaming[chain_id] = f"{mol_type}{chain_id}"
    return renaming
