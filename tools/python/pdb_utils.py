"""
Description: This script calculates the molecular weight of a PDB file.
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
