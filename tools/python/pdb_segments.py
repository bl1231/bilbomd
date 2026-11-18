"""
How BilboMD splits a PDB file into molecules: CHARMM segments (pdb2crd.py)
and OpenMM chains (prep_pdb.py, and gen-openmm-slurm-file.py on NERSC).

Standard library only, so it also runs on a NERSC login node.
packages/bilbomd-types/src/constraints/structure.ts mirrors these rules for
the constraint editor and the server's validator.
"""

# Residue names by molecule type. These must match PROTEIN_RESIDUES,
# DNA_RESIDUES (plus the CHARMM aliases), RNA_RESIDUES and
# CARBOHYDRATE_RESIDUES in packages/bilbomd-types/src/pdbResidues.ts, which
# upload validation and the constraint editor use;
# python_tests/test_pdb_utils_residues.py fails when they drift apart.
PROTEIN_RESIDUES = frozenset(
    [
        "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
        "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
        # Phosphorylated; renamed to the standard residue + a patch by pdb2crd
        "SEP", "TPO", "PTR",
        # CHARMM's HIS, in files previously processed by CHARMM
        "HSD",
    ]
)  # fmt: skip
DNA_RESIDUES = frozenset(["DA", "DC", "DG", "DT", "DI", "ADE", "CYT", "GUA", "THY"])
RNA_RESIDUES = frozenset(["A", "C", "G", "U", "I"])
CARBOHYDRATE_RESIDUES = frozenset(
    [
        "AFL", "ALL", "ALT", "BMA", "BGC", "BOG", "FCA", "FCB", "FMF", "FUC",
        "FUL", "G4S", "GAL", "GLA", "GLB", "GLC", "GLS", "GSA", "GUL", "IDO",
        "LAK", "LAT", "MAF", "MAL", "MAN", "NAG", "NAN", "NGA", "RHM", "RIB",
        "SIA", "SLB", "TAL", "XYL",
        # GLYCAM names
        "AMA", "BGL",
    ]
)  # fmt: skip


def classify_residue(residue):
    """
    Classify a residue name into molecule type: PRO, DNA, RNA, CAR or UNKNOWN.
    """
    if residue in PROTEIN_RESIDUES:
        return "PRO"
    if residue in DNA_RESIDUES:
        return "DNA"
    if residue in RNA_RESIDUES:
        return "RNA"
    if residue in CARBOHYDRATE_RESIDUES:
        return "CAR"
    return "UNKNOWN"


# Backbone links between residue i and i+1. Anything clearly longer than the
# bond means the two residues are not linked: a missing loop or separate
# molecules, which CHARMM must not bond across.
# Nucleic acids: O3'(i)-P(i+1) is a 1.6 A bond; when P is missing,
# O3'(i)-O5'(i+1) is about 2.5 A through it.
MAX_O3_P_BOND = 2.5
MAX_O3_O5_LINK = 3.5
# Proteins: C(i)-N(i+1) is a 1.33 A peptide bond; when C or N is missing,
# CA(i)-CA(i+1) is 3.8 A (2.9 A for a cis peptide).
MAX_C_N_BOND = 2.0
MAX_CA_CA_LINK = 4.5
NUCLEIC_TYPES = frozenset(["DNA", "RNA"])


def _residues(lines):
    """Groups consecutive ATOM/HETATM lines into residues (lists of lines)."""
    residues = []
    current_key = None
    for line in lines:
        # resName, chainID, resSeq and iCode identify a residue
        key = line[17:27]
        if key != current_key:
            residues.append([])
            current_key = key
        residues[-1].append(line)
    return residues


def _atom_coords(residue, names):
    """Coordinates of the first atom in the residue with one of these names."""
    for line in residue:
        if line[12:16].strip() in names:
            try:
                return (float(line[30:38]), float(line[38:46]), float(line[46:54]))
            except ValueError:
                return None
    return None


def _distance(a, b):
    return sum((p - q) ** 2 for p, q in zip(a, b)) ** 0.5


def _link_distance(prev_residue, next_residue, first, second):
    """
    The distance between atom `first` of one residue and `second` of the next
    (each a tuple of accepted names), or None if either atom is missing.
    """
    a = _atom_coords(prev_residue, first)
    b = _atom_coords(next_residue, second)
    return None if a is None or b is None else _distance(a, b)


def _chain_break(prev_residue, next_residue):
    """
    Where two consecutive residues of the same polymer type are clearly not
    bonded, a description of the gap (e.g. "C-N 31.4 A"), else None. Links
    that can't be judged (atoms missing) are left alone.
    """
    prev_type = _residue_type(prev_residue)
    if prev_type != _residue_type(next_residue):
        return None
    if prev_type in NUCLEIC_TYPES:
        checks = [
            (("O3'", "O3*"), ("P",), MAX_O3_P_BOND, "O3'-P"),
            (("O3'", "O3*"), ("O5'", "O5*"), MAX_O3_O5_LINK, "O3'-O5'"),
        ]
    elif prev_type == "PRO":
        checks = [
            (("C",), ("N",), MAX_C_N_BOND, "C-N"),
            (("CA",), ("CA",), MAX_CA_CA_LINK, "CA-CA"),
        ]
    else:
        return None
    for first, second, limit, label in checks:
        distance = _link_distance(prev_residue, next_residue, first, second)
        if distance is not None:
            return f"{label} {distance:.1f} A" if distance > limit else None
    return None


def _residue_type(residue):
    return classify_residue(residue[0][17:20].strip())


def _resseq(residue):
    return residue[0][22:27].strip()


def split_at_chain_breaks(lines):
    """
    Splits a segment's lines wherever two consecutive protein residues or
    nucleotides are not bonded (a missing loop, or separate strands), so
    CHARMM does not bond across the gap.

    :return: A list of (lines, break) pairs in file order, where break
        describes the gap before that piece (None for the first piece).
    """
    pieces = [([], None)]
    previous = None
    for residue in _residues(lines):
        gap = _chain_break(previous, residue) if previous is not None else None
        if gap is not None:
            pieces.append(
                ([], f"chain break after residue {_resseq(previous)} ({gap})")
            )
        pieces[-1][0].extend(residue)
        previous = residue
    return [(piece, gap) for piece, gap in pieces if piece]


def read_raw_segments(lines):
    """
    Groups ATOM/HETATM lines into molecules. A chain's atoms start a new
    molecule after a TER record, when the segid (columns 73-76) changes, or
    where consecutive nucleotides are not bonded. Separate molecules that share
    a chain ID would otherwise be generated as one polymer and bonded
    together.

    :return: A list of dicts with 'chainid', 'input_segid', 'reason' (why the
        molecule was split from the previous one of its chain, or None),
        'ends_at_break' (True when the next piece of the chain follows a
        chain break, so this one has no real C-terminus) and 'lines', in file
        order.
    """
    segments = []
    open_segment = {}  # chain ID -> its segment that atoms are still added to
    last_chain = None
    for line in lines:
        if line.startswith("ENDMDL"):
            # Only the first model is built
            break
        if line.startswith("TER"):
            # TER ends the chain of the atoms before it (its own chain ID is
            # often blank)
            open_segment.pop(last_chain, None)
            continue
        if not line.startswith(("ATOM", "HETATM")):
            continue
        chain_id = line[21]
        input_segid = line[72:76].strip()
        last_chain = chain_id
        current = open_segment.get(chain_id)
        if current is not None and current["input_segid"] == input_segid:
            current["lines"].append(line)
            continue
        seen = any(s["chainid"] == chain_id for s in segments)
        if not seen:
            reason = None
        elif current is None:
            reason = "TER record"
        else:
            reason = f"segid change {current['input_segid'] or '(blank)'} -> {input_segid or '(blank)'}"
        segment = {
            "chainid": chain_id,
            "input_segid": input_segid,
            "reason": reason,
            "lines": [line],
        }
        segments.append(segment)
        open_segment[chain_id] = segment

    split = []
    for segment in segments:
        pieces = split_at_chain_breaks(segment["lines"])
        for index, (piece, gap) in enumerate(pieces):
            split.append(
                {
                    **segment,
                    "reason": segment["reason"] if index == 0 else gap,
                    "ends_at_break": index < len(pieces) - 1,
                    "lines": piece,
                }
            )
    return split


class _NumberedLine(str):
    """A line that remembers its position in the file."""

    number: int


def insert_ter_records(lines):
    """
    The lines with a TER record added wherever read_raw_segments starts a new
    molecule within a chain (a segid change or a chain break) and the file
    has none. OpenMM's PDB reader starts a new chain at each TER, so OpenMM
    builds the same molecules as CHARMM, with no bond across a break.

    :return: (lines, number of TER records added)
    """
    numbered = []
    for number, line in enumerate(lines):
        tagged = _NumberedLine(line)
        tagged.number = number
        numbered.append(tagged)
    starts = {
        segment["lines"][0].number
        for segment in read_raw_segments(numbered)
        if segment["reason"] is not None and segment["reason"] != "TER record"
    }
    out = []
    for number, line in enumerate(lines):
        if number in starts:
            out.append("TER\n")
        out.append(line)
    return out, len(starts)
