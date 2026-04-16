"""Convert an mmCIF file to PDB format using biopython.

Usage:
    python cif_to_pdb.py <input.cif> <output.pdb>
"""

import sys
from Bio.PDB import MMCIFParser, PDBIO

if len(sys.argv) != 3:
    print("Usage: cif_to_pdb.py <input.cif> <output.pdb>", file=sys.stderr)
    sys.exit(1)

input_cif = sys.argv[1]
output_pdb = sys.argv[2]

parser = MMCIFParser(QUIET=True)
structure = parser.get_structure("structure", input_cif)
io = PDBIO()
io.set_structure(structure)
io.save(output_pdb)
print(f"Converted {input_cif} -> {output_pdb}")
