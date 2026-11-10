"""
Description: This script calculates the molecular weight of a PDB file.
Also contains shared utilities for PDB processing in BilboMD.
"""

from Bio.Data.IUPACData import (
    protein_weights,
    unambiguous_dna_weights,
    unambiguous_rna_weights,
)
from Bio.PDB import MMCIFParser
from Bio.SeqUtils import molecular_weight as sequence_weight

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


WATER_DA = 18.0153

# Residue names that map onto a standard amino acid for mass bookkeeping
_PROTEIN_LETTERS = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q",
    "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K",
    "MET": "M", "PHE": "F", "PRO": "P", "SER": "S", "THR": "T", "TRP": "W",
    "TYR": "Y", "VAL": "V",
    # CHARMM / AMBER protonation variants
    "HSD": "H", "HSE": "H", "HSP": "H", "HID": "H", "HIE": "H", "HIP": "H",
    "CYX": "C", "CYM": "C", "ASH": "D", "GLH": "E", "LYN": "K",
}  # fmt: skip

# (letter, kind) for nucleotide residue names. kind None means the name is
# used for both DNA and RNA (CHARMM) and the sugar decides.
_NUCLEIC_LETTERS = {
    "DA": ("A", "dna"), "DC": ("C", "dna"), "DG": ("G", "dna"), "DT": ("T", "dna"),
    "A": ("A", "rna"), "C": ("C", "rna"), "G": ("G", "rna"), "U": ("U", "rna"),
    "ADE": ("A", None), "CYT": ("C", None), "GUA": ("G", None),
    "THY": ("T", "dna"), "URA": ("U", "rna"),
}  # fmt: skip


def _standard_residue_mass(resname, has_o2_prime):
    """
    Mass (Da) of a standard residue inside a chain, hydrogens included, or
    None when the residue name is not a standard amino acid or nucleotide.
    """
    letter = _PROTEIN_LETTERS.get(resname)
    if letter is not None:
        return protein_weights[letter] - WATER_DA
    nucleotide = _NUCLEIC_LETTERS.get(resname)
    if nucleotide is None:
        return None
    letter, kind = nucleotide
    if kind is None:
        kind = "rna" if has_o2_prime else "dna"
    table = unambiguous_rna_weights if kind == "rna" else unambiguous_dna_weights
    return table[letter] - WATER_DA


def residue_composition(pdb_file):
    """
    Mass of a PDB file's first model, split by molecule type, counting each
    standard residue at its full mass whatever atoms the file lists.

    Deposited and predicted structures usually have no hydrogens, and some
    lack side-chain atoms; summing the atoms present would read about 7 % light
    for a protein. Residues that are not standard amino acids or nucleotides
    (ions, ligands, sugars, modified residues) fall back to the sum of their
    atoms. Water is not counted and alternate conformers count once.

    Returns the same keys as molecular_composition, plus n_residues.
    """
    residues = {}
    chains = set()

    with open(pdb_file, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("ENDMDL"):
                break
            if not line.startswith(("ATOM", "HETATM")):
                continue
            resname = line[17:21].strip().upper()
            residue_class = _residue_class(resname)
            if residue_class == "water":
                continue
            key = (line[72:76], line[21], line[22:27])
            residue = residues.setdefault(
                key,
                {
                    "resname": resname,
                    "class": residue_class,
                    "altloc": None,
                    "atoms_da": 0.0,
                    "n_atoms": 0,
                    "unknown_atoms": 0,
                    "has_o2_prime": False,
                },
            )
            altloc = line[16]
            if altloc != " ":
                if residue["altloc"] is None:
                    residue["altloc"] = altloc
                elif residue["altloc"] != altloc:
                    continue
            residue["n_atoms"] += 1
            if line[12:16].strip().upper() in ("O2'", "O2*"):
                residue["has_o2_prime"] = True
            element = _atom_element(line, residue_class)
            if element is None:
                residue["unknown_atoms"] += 1
            else:
                residue["atoms_da"] += ATOMIC_WEIGHTS[element]

    if not residues:
        raise ValueError(f"No atoms found in PDB file: {pdb_file}")

    masses = {"protein": 0.0, "nucleic": 0.0, "other": 0.0}
    for (segid, chain, _), residue in residues.items():
        standard = _standard_residue_mass(residue["resname"], residue["has_o2_prime"])
        if standard is None:
            masses[residue["class"]] += residue["atoms_da"]
            continue
        masses[residue["class"]] += standard
        chains.add((segid, chain, residue["class"]))
    # Each polymer chain carries one water more than the sum of its residues
    for _, _, residue_class in chains:
        masses[residue_class] += WATER_DA

    return {
        "total_da": sum(masses.values()),
        "protein_da": masses["protein"],
        "nucleic_da": masses["nucleic"],
        "other_da": masses["other"],
        "n_atoms": sum(r["n_atoms"] for r in residues.values()),
        "unknown_atoms": sum(r["unknown_atoms"] for r in residues.values()),
        "n_residues": len(residues),
    }


def psf_composition(psf_file):
    """
    Mass of a CHARMM/X-PLOR PSF file's atoms, split by molecule type. A PSF
    lists every atom with its mass, so nothing has to be inferred. Water is
    not counted.
    """
    masses = {"protein": 0.0, "nucleic": 0.0, "other": 0.0}
    n_atoms = 0
    remaining = None

    with open(psf_file, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if remaining is None:
                if "!NATOM" in line:
                    remaining = int(line.split()[0])
                continue
            if remaining == 0:
                break
            fields = line.split()
            if len(fields) < 8:
                continue
            remaining -= 1
            residue_class = _residue_class(fields[3].upper())
            if residue_class == "water":
                continue
            masses[residue_class] += float(fields[7])
            n_atoms += 1

    if n_atoms == 0:
        raise ValueError(f"No atoms found in PSF file: {psf_file}")

    return {
        "total_da": sum(masses.values()),
        "protein_da": masses["protein"],
        "nucleic_da": masses["nucleic"],
        "other_da": masses["other"],
        "n_atoms": n_atoms,
        "unknown_atoms": 0,
    }


_SEQUENCE_TYPES = {"protein": "protein", "dna": "DNA", "rna": "RNA"}


def sequence_composition(entities):
    """
    Mass of molecules given as sequences: a list of dicts with `type`
    (Protein, DNA or RNA), `sequence` and optional `copies`.
    """
    masses = {"protein": 0.0, "nucleic": 0.0, "other": 0.0}
    for entity in entities:
        kind = str(entity.get("type", "")).lower()
        if kind not in _SEQUENCE_TYPES:
            raise ValueError(f"Unknown molecule type: {entity.get('type')}")
        sequence = "".join(str(entity.get("sequence", "")).split()).upper()
        if not sequence:
            raise ValueError("A sequence is empty.")
        copies = int(entity.get("copies", 1))
        if copies < 1:
            raise ValueError("Copies must be at least 1.")
        mass = sequence_weight(sequence, seq_type=_SEQUENCE_TYPES[kind])
        masses["protein" if kind == "protein" else "nucleic"] += mass * copies

    if sum(masses.values()) <= 0:
        raise ValueError("No sequences were given.")

    return {
        "total_da": sum(masses.values()),
        "protein_da": masses["protein"],
        "nucleic_da": masses["nucleic"],
        "other_da": 0.0,
        "n_atoms": 0,
        "unknown_atoms": 0,
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
