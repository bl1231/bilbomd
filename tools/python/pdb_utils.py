"""
Description: This script calculates the molecular weight of a PDB file.
Also contains shared utilities for PDB processing in BilboMD.
"""

from Bio.PDB.PDBParser import PDBParser

ATOMIC_WEIGHTS = {
    "H": 1.008,
    "C": 12.011,
    "N": 14.007,
    "O": 15.999,
    "P": 30.974,
    "S": 32.06,
}


def calculate_molecular_weight(pdb_file):
    """
    Uses BioPython to calculate the molecular weight of a PDB file
    and prints the number of atoms encountered.
    """
    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("molecule", pdb_file)

    if structure is None:
        raise ValueError(f"Unable to parse the PDB file: {pdb_file}")

    molecular_weight = 0.0
    atom_count = 0  # Atom counter

    for model in structure:
        for chain in model:
            for residue in chain:
                for atom in residue:
                    atom_count += 1  # Increment the counter for each atom
                    element = atom.element.strip()
                    if element in ATOMIC_WEIGHTS:
                        molecular_weight += ATOMIC_WEIGHTS[element]
                    else:
                        pass
                        # print(f"Unknown element {element}, skipping...")

    # print(f"Total number of atoms: {atom_count}")
    return molecular_weight


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
