"""
Splits a PDB file into individual files.
Each file containing one chain from the input PDB file.
Sanitizes the PDB files to be used by CHARMM in order to convert to CRD and PSF files.
Writes a CHARMM-compatible pdb_2_crd.inp file for CHARMM.

PDB specification from:
    https://www.wwpdb.org/documentation/file-format-content/format33/sect1.html

COLUMNS        DATA  TYPE    FIELD        DEFINITION
-------------------------------------------------------------------------------------
 1 -  6        Record name   "ATOM  "
 7 - 11        Integer       serial       Atom  serial number.
13 - 16        Atom          name         Atom name.
17             Character     altLoc       Alternate location indicator.
18 - 20        Residue name  resName      Residue name.
22             Character     chainID      Chain identifier.
23 - 26        Integer       resSeq       Residue sequence number.
27             AChar         iCode        Code for insertion of residues.
31 - 38        Real(8.3)     x            Orthogonal coordinates for X in Angstroms.
39 - 46        Real(8.3)     y            Orthogonal coordinates for Y in Angstroms.
47 - 54        Real(8.3)     z            Orthogonal coordinates for Z in Angstroms.
55 - 60        Real(6.2)     occupancy    Occupancy.
61 - 66        Real(6.2)     tempFactor   Temperature  factor.
77 - 78        LString(2)    element      Element symbol, right-justified.
79 - 80        LString(2)    charge       Charge  on the atom.

CRD specification from the CHARMM io documentation:

The CARD file format is the standard means in CHARMM for
providing a human readable and writable coordinate file. The format is
as follows:

* Normal format for less than 100000 atoms and PSF IDs with less than
five characters
         title
         NATOM (I5)
         ATOMNO RESNO   RES  TYPE  X     Y     Z   SEGID RESID Weighting
           I5    I5  1X A4 1X A4 F10.5 F10.5 F10.5 1X A4 1X A4 F10.5

* Expanded format for more than 100000 atoms (upto 10**10) and with
upto 8 character PSF IDs. (versions c31a1 and later)
         title
         NATOM (I10)
         ATOMNO RESNO   RES  TYPE  X     Y     Z   SEGID RESID Weighting
           I10   I10 2X A8 2X A8       3F20.10     2X A8 2X A8 F20.10

"""

import argparse
import os
import sys

from pdb_utils import classify_residue, determine_molecule_type_details

TOPO_FILES = os.environ.get("CHARMM_TOPOLOGY", "/app/scripts/bilbomd_top_par_files.str")

# Single-atom ions (and common polyatomic ions) that CHARMM's standard topology
# does not support.  These mirror the ions already accepted by SUPPORTED_PDB_RESIDUES
# in packages/bilbomd-types/src/pdbResidues.ts.
KNOWN_IONS = frozenset([
    # Alkali metals
    "LI", "NA", "K", "RB", "CS",
    # Alkaline earth
    "MG", "CA", "SR", "BA",
    # Transition metals
    "SC", "TI", "V", "CR", "MN", "FE", "CO", "NI", "CU", "ZN", "MO", "CD", "HG",
    # Post-transition metals / metalloids
    "AL", "GA", "IN", "SN", "PB", "B", "SE", "AS",
    # Halogens (as ions)
    "CL", "BR", "F",
    # Common polyatomic ions
    "SO4", "PO4", "NO3", "CN",
])


# Nucleic-acid backbone link between residue i and i+1. O3'(i)-P(i+1) is a
# 1.6 A bond; when P is missing, O3'(i)-O5'(i+1) is about 2.5 A through it.
# Anything clearly longer means the two residues are not linked.
MAX_O3_P_BOND = 2.5
MAX_O3_O5_LINK = 3.5
NUCLEIC_TYPES = frozenset(["DNA", "RNA"])

# Letters tried, in order, for a segment split off a chain whose own name is
# already taken
SEGMENT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def get_segment_filename(segid, pdb_filename):
    """
    Generates the filename of a segment's PDB file. CHARMM input uses
    lowercase filenames, so '_uc' marks a segid ending in an uppercase letter
    to keep e.g. PROA and PROa apart.

    :param segid: The CHARMM segment ID (e.g. 'PROA', 'DNAB').
    :param pdb_filename: The original PDB filename.
    :return: The segment's PDB filename.
    """
    suffix = "_uc" if segid[-1].isupper() else ""
    base_filename = os.path.splitext(os.path.basename(pdb_filename))[0].lower()
    return f"pdb2crd_seg_{segid.lower()}{suffix}_{base_filename}.pdb"


def segment_name(molecule_type, letter):
    """
    The CHARMM segid for a molecule type and letter, as CHARMM-GUI names them:
    type then letter (PROA, DNAD). Carbohydrates are CAR + letter for an
    uppercase letter, otherwise CAL + the letter uppercased.
    """
    if molecule_type == "CAR":
        prefix = "CAR" if letter.isupper() else "CAL"
        return f"{prefix}{letter.upper()}"
    return f"{molecule_type}{letter}"


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


def _nucleic_link_broken(prev_residue, next_residue):
    """
    True if two consecutive nucleotides are clearly not bonded: O3'(i) is far
    from P(i+1), or from O5'(i+1) when P is missing. Missing O3' means the
    link cannot be judged, so it is left alone.
    """
    o3 = _atom_coords(prev_residue, ("O3'", "O3*"))
    if o3 is None:
        return False
    p = _atom_coords(next_residue, ("P",))
    if p is not None:
        return _distance(o3, p) > MAX_O3_P_BOND
    o5 = _atom_coords(next_residue, ("O5'", "O5*"))
    if o5 is not None:
        return _distance(o3, o5) > MAX_O3_O5_LINK
    return False


def _residue_type(residue):
    return classify_residue(residue[0][17:20].strip())


def split_at_nucleic_breaks(lines):
    """
    Splits a segment's lines wherever two consecutive nucleotides are not
    bonded, so separate strands are not generated as one polymer.

    :return: A list of line lists, one per piece, in file order.
    """
    pieces = [[]]
    previous = None
    for residue in _residues(lines):
        if (
            previous is not None
            and _residue_type(previous) in NUCLEIC_TYPES
            and _residue_type(residue) in NUCLEIC_TYPES
            and _nucleic_link_broken(previous, residue)
        ):
            pieces.append([])
        pieces[-1].extend(residue)
        previous = residue
    return [piece for piece in pieces if piece]


def read_raw_segments(lines):
    """
    Groups ATOM/HETATM lines into molecules. A chain's atoms start a new
    molecule after a TER record, when the segid (columns 73-76) changes, or
    where consecutive nucleotides are not bonded. Separate molecules that share
    a chain ID would otherwise be generated as one polymer and bonded
    together.

    :return: A list of dicts with 'chainid', 'input_segid', 'reason' (why the
        molecule was split from the previous one of its chain, or None) and
        'lines', in file order.
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
        pieces = split_at_nucleic_breaks(segment["lines"])
        for index, piece in enumerate(pieces):
            split.append(
                {
                    **segment,
                    "reason": segment["reason"] if index == 0 else "O3'-P gap",
                    "lines": piece,
                }
            )
    return split


def assign_segids(segments):
    """
    Names each segment. The first segment of a chain keeps the input chain ID
    (PROA, DNAD), so files with one molecule per chain are named as before.
    A later segment of the same chain gets, in order of preference: its type
    with the chain's own letter (e.g. a glycan after protein chain A is CARA),
    the last letter of its input segid (strand DNAB of chain D stays DNAB),
    or the first letter no chain in the file uses. Letters other chains use
    are skipped, so result PDBs (chain = last letter of segid) keep chains
    apart.

    Sets 'segid' on each segment.
    """
    chain_letters = {s["chainid"].upper() for s in segments}
    taken = set()
    named_chains = set()
    for segment in segments:
        chain_id = segment["chainid"]
        molecule_type = segment["type"]
        if chain_id not in named_chains:
            named_chains.add(chain_id)
            segid = segment_name(molecule_type, chain_id)
        else:
            candidates = []
            if chain_id.isalnum():
                candidates.append(chain_id)
            segid_letter = segment["input_segid"][-1:]
            if segid_letter.isalnum() and segid_letter.upper() not in chain_letters:
                candidates.append(segid_letter)
            candidates.extend(c for c in SEGMENT_LETTERS if c not in chain_letters)
            segid = next(
                (
                    name
                    for name in (segment_name(molecule_type, c) for c in candidates)
                    if name.upper() not in taken
                ),
                None,
            )
            if segid is None:
                raise ValueError(
                    f"Chain {chain_id} has more {molecule_type} molecules than "
                    "there are free segment letters"
                )
        taken.add(segid.upper())
        segment["segid"] = segid


def _residue_span(lines):
    numbers = [line[22:26].strip() for line in lines]
    return f"{numbers[0]}-{numbers[-1]}" if numbers else "none"


def warn_split_chains(segments):
    """Prints a warning for each chain built as more than one segment."""
    by_chain = {}
    for segment in segments:
        by_chain.setdefault(segment["chainid"], []).append(segment)
    for chain_id, chain_segments in by_chain.items():
        if len(chain_segments) < 2:
            continue
        parts = ", ".join(
            f"{s['segid']} (residues {_residue_span(s['processed_lines'])}"
            + (f", split at {s['reason']}" if s["reason"] else "")
            + ")"
            for s in chain_segments
        )
        print(
            f"WARNING: Chain {chain_id} holds {len(chain_segments)} separate "
            f"molecules, built as CHARMM segments {parts}",
            file=sys.stderr,
        )


def remove_water(lines):
    """
    Remove HOH residues
    """
    processed_lines = []
    for line in lines:
        if line.startswith(("ATOM", "HETATM")):
            # Extract the residue name from columns 18-20
            residue_name = line[17:20]
            if residue_name != "HOH":
                processed_lines.append(line)  # Only append if not water
        else:
            processed_lines.append(line)  # Always append non-ATOM/HETATM lines

    return processed_lines


def remove_ions(lines):
    """
    Remove HETATM/ATOM lines whose residue name is a known single-atom ion
    (or common polyatomic ion) that CHARMM cannot process.
    """
    processed_lines = []
    for line in lines:
        if line.startswith(("ATOM", "HETATM")):
            residue_name = line[17:20].strip()
            if residue_name not in KNOWN_IONS:
                processed_lines.append(line)
        else:
            processed_lines.append(line)
    return processed_lines


def remove_alt_conformers(lines):
    """
    Remove lines where the 27th column (index 26 in Python) is not a space.
    This is the column used by PDB to denote an alternate conformation.

    :param lines: List of strings (lines from the PDB file).
    :return: List of strings with lines removed according to the condition.
    """
    processed_lines = [line for line in lines if line[26] == " "]
    return processed_lines


def apply_charmm_residue_names(lines):
    """
    Processes lines of a single chain renaming residues to be CHARMM-compatible.

    :param lines: The list of lines (strings) from the PDB file for a specific chain.
    :return: A list of processed lines.
    """
    residue_replacements = {
        "HIS": "HSD ",
        "SEP": "SER ",
        "TPO": "THR ",
        "PTR": "TYR ",
        "C  ": "CYT ",
        "G  ": "GUA ",
        "A  ": "ADE ",
        "U  ": "URA ",
        " C ": "CYT ",
        " G ": "GUA ",
        " A ": "ADE ",
        " U ": "URA ",
        "  C": "CYT ",
        "  G": "GUA ",
        "  A": "ADE ",
        "  U": "URA ",
        "DC ": "CYT ",
        "DG ": "GUA ",
        "DA ": "ADE ",
        "DT ": "THY ",
        " DC": "CYT ",
        " DG": "GUA ",
        " DA": "ADE ",
        " DT": "THY ",
        "NAG": "BGLC",
        "BMA": "BMAN",
        "MAN": "AMAN",
        "GAL": "AGAL",
        "FUL": "BFUC",
        "FUC": "AFUC",
        "AFL": "AFUC",
        "RIB": "ARIB",
        "GLC": "AGLC",
        "ALT": "AALT",
        "ALL": "AALL",
        "GUL": "AGUL",
        "BGC": "BGUL",
        "IDO": "AIDO",
        "TAL": "ATAL",
        "XYL": "AXYL",
        "RHM": "ARHM",
        "SIA": "BSIA",
        "HEM": "HEME",
    }

    processed_lines = []
    for line in lines:
        if line.startswith(("ATOM", "HETATM")):
            # Extract the residue name from columns 18-20
            residue_name = line[17:20]
            # print(f"old: {residue_name}")
            # Check if the residue name needs to be replaced
            if residue_name in residue_replacements:
                # Replace only the part of the line with the new residue name
                new_residue_name = residue_replacements[residue_name]
                # print(f"new: {new_residue_name}")
                line = line[:17] + new_residue_name + line[21:]
        processed_lines.append(line)

    return processed_lines


def replace_hetatm(lines):
    """
    Replace all HETATM with ATOM
    """
    processed_lines = []
    for line in lines:
        if "HETATM" in line:
            line = line.replace("HETATM", "ATOM  ")

        processed_lines.append(line)

    return processed_lines


def write_pdb_2_crd_inp_files(segments, output_dir, pdb_file_path):
    """
    Write individual CHARMM input file to convert each segment to a CRD and PSF file.
    """
    charmm_gen_options = {
        "PRO": "setup warn first none last none",
        "DNA": "setup warn first 5TER last 3TER",
        "RNA": "setup warn first 5TER last 3TER",
        "CAR": "setup",
    }
    input_filename = os.path.basename(pdb_file_path)
    for chain_data in segments:
        molecule_type = chain_data["type"]
        charmmgui_chain_id = chain_data["segid"]
        segment_filename = get_segment_filename(charmmgui_chain_id, pdb_file_path)

        output_file = f"{output_dir}/pdb2crd_charmm_{charmmgui_chain_id.lower()}.inp"
        lines = chain_data["lines"]
        original_lines = chain_data["original_lines"]
        if lines:  # Ensure there's at least one line to process
            # Extract resnum
            start_res_num_str = lines[0][22:26]
            # Convert to integer and subtract 1
            start_res_num = int(start_res_num_str) - 1
            # Need string?... convert back to str
            start_res_num_str = str(start_res_num)
        with open(output_file, mode="w", encoding="utf8") as outfile:
            outfile.write("* PURPOSE: Convert PDB file to CRD and PSF\n")
            outfile.write("* AUTHOR: Michal Hammel\n")
            outfile.write("* AUTHOR: Scott Classen\n")
            outfile.write(f"* INPUT PDB: {input_filename}\n")
            outfile.write("*\n")
            outfile.write("\n")
            outfile.write("bomlev -2\n")
            outfile.write("\n")
            outfile.write(f"STREAM {TOPO_FILES}\n")
            outfile.write("\n")
            outfile.write(
                f"! {charmmgui_chain_id} --------------------------------------\n"
            )
            outfile.write("! READ SEQUENCE AND COORDINATES FROM PDB FILE\n")
            outfile.write(f"open unit 1 read card name {segment_filename}\n")
            outfile.write("read sequ pdb unit 1\n")

            outfile.write("rewind unit 1\n")
            # Enhanced CHARMM generate line
            molinfo = chain_data.get("molinfo", {})
            types_present = molinfo.get("types_present", set())
            last_type = molinfo.get("last_residue_type", "UNKNOWN")

            if types_present == {"PRO"} and last_type == "PRO":
                gen_opts = "setup warn first none last CTER"
            else:
                gen_opts = charmm_gen_options.get(
                    molecule_type, "setup warn first none last none"
                )

            outfile.write(f"generate {charmmgui_chain_id} {gen_opts}\n")
            outfile.write(f"read coor pdb unit 1 offset -{start_res_num_str}\n")

            # Detect phosphorylated residues and insert patch commands
            wrote_patch_comment = False
            phos_patch_map = {
                "SEP": "SP1",  # phosphoserine
                "TPO": "THP1",  # phosphothreonine
                "PTR": "TP1",  # phosphotyrosine
            }
            seen_patches = set()
            for line in original_lines:
                if line.startswith("ATOM") or line.startswith("HETATM"):
                    resname = line[17:20].strip()
                    resnum = line[22:26].strip()
                    if (
                        resname in phos_patch_map
                        and (resname, resnum) not in seen_patches
                    ):
                        if not wrote_patch_comment:
                            outfile.write("\n")
                            outfile.write("! PATCH PHOSPHORYLATED RESIDUES\n")
                            outfile.write("! (e.g., SP1, THP1, TP1)\n")
                            wrote_patch_comment = True
                        patch_name = phos_patch_map[resname]
                        outfile.write(
                            f"patch {patch_name} {charmmgui_chain_id} {resnum} setup warn\n"
                        )
                        seen_patches.add((resname, resnum))

            outfile.write("close unit 1\n")
            outfile.write("\n")
            outfile.write("! PLACE ANY MISSING HEAVY ATOMS\n")
            outfile.write("ic generate\n")
            outfile.write("ic param\n")
            outfile.write("ic fill preserve\n")
            outfile.write("ic build\n")
            outfile.write("\n")
            outfile.write("! print missing atoms after IC commands\n")
            outfile.write("coor print sele .not. init end\n")
            outfile.write("\n")
            outfile.write("! REBUILD ALL H ATOM COORDS\n")
            outfile.write(
                f"coor init sele segid {charmmgui_chain_id} .and. type H* end\n"
            )
            outfile.write(f"hbuild sele segid {charmmgui_chain_id} .and. type H* end\n")
            outfile.write("\n")
            outfile.write("! print missing atoms after adding Hydrogens\n")
            outfile.write("coor print sele .not. init end\n")
            outfile.write("\n")
            outfile.write("! CALCULATE ENERGY\n")
            outfile.write("energy\n")
            outfile.write("\n")
            outfile.write("! WRITE INDIVIDUAL CHAIN CRD/PSF\n")
            outfile.write("IOFOrmat EXTEnded\n")
            outfile.write(
                f"write psf card name bilbomd_pdb2crd_{charmmgui_chain_id}.psf\n"
            )
            outfile.write(
                f"write coor card name bilbomd_pdb2crd_{charmmgui_chain_id}.crd\n"
            )
            outfile.write(
                f"write coor pdb name bilbomd_pdb2crd_{charmmgui_chain_id}.pdb "
                f"official\n"
            )
            outfile.write("\n")
            outfile.write("stop\n")
        print(f"{output_file.split('/')[-1]}")


def write_meld_chain_crd_files(segments, output_dir, pdb_file_path):
    """
    Melds individual segment CRD files into a single CRD file for subsequent CHARMM steps
    """
    # Get the input filename:
    input_filename = os.path.basename(pdb_file_path)
    output_file = f"{output_dir}/pdb2crd_charmm_meld.inp"
    with open(output_file, mode="w", encoding="utf8") as outfile:
        outfile.write("* PURPOSE: Join All Individual Chain CRD Files\n")
        outfile.write("* AUTHOR: Michal Hammel\n")
        outfile.write("* AUTHOR: Scott Classen\n")
        outfile.write(f"* ORIGINAL INPUT PDB: {input_filename}\n")
        outfile.write("*\n")
        outfile.write("\n")
        outfile.write("DIMENS CHSIZE 5000000 MAXRES 3000000\n")
        outfile.write("\n")
        outfile.write("bomlev -2\n")
        outfile.write("\n")
        outfile.write("! Read topology and parameter files\n")
        outfile.write(f"STREAM {TOPO_FILES}\n")
        outfile.write("\n")
        outfile.write("\n")
        # loop over each chain and read PSF and CRD files directly
        first = True
        for chain_data in segments:
            charmmgui_chain_id = chain_data["segid"]

            outfile.write(f"! Read {charmmgui_chain_id}\n")

            # Read PSF
            outfile.write(
                f"open read unit 10 card name bilbomd_pdb2crd_{charmmgui_chain_id}.psf\n"
            )
            if first:
                outfile.write("read psf card unit 10\n")
            else:
                outfile.write("read psf card unit 10 append\n")
            outfile.write("close unit 10\n")

            # Read COOR
            outfile.write(
                f"open read unit 11 card name bilbomd_pdb2crd_{charmmgui_chain_id}.crd\n"
            )
            if first:
                outfile.write("read coor card unit 11\n")
            else:
                outfile.write("read coor card unit 11 append\n")
            outfile.write("close unit 11\n\n")

            first = False
        # end chain loop
        outfile.write("\n")
        outfile.write("! Print heavy atoms with unknown coordinates\n")
        outfile.write("coor print sele ( .not. INIT ) .and. ( .not. hydrogen ) end\n")
        outfile.write("\n")
        outfile.write("! print all missing atoms\n")
        outfile.write("coor print sele .not. init end\n")
        outfile.write("\n")
        outfile.write("! Write PSF file\n")
        outfile.write("open write unit 10 card name bilbomd_pdb2crd.psf\n")
        outfile.write("write psf  unit 10 card\n")
        outfile.write("\n")
        outfile.write("! Write CRD file\n")
        outfile.write("open write card unit 10 name bilbomd_pdb2crd.crd\n")
        outfile.write("write coor unit 10 card\n")
        outfile.write("\n")
        outfile.write("! Write CHARMM PDB file\n")
        outfile.write("open write card unit 10 name bilbomd_pdb2crd.pdb\n")
        outfile.write("write coor pdb  unit 10 official\n")
        outfile.write("\n")
        outfile.write("coor stat sele all end\n")
        outfile.write("\n")
        outfile.write("calc cgtot = int ( ?cgtot )\n")
        outfile.write("\n")
        outfile.write("open write card unit 90 name bilbomd_pdb2crd.str\n")
        outfile.write("write title unit 90\n")
        outfile.write("* set ncharge = @cgtot\n")
        outfile.write("* set xmax = ?xmax\n")
        outfile.write("* set ymax = ?ymax\n")
        outfile.write("* set zmax = ?zmax\n")
        outfile.write("* set xmin = ?xmin\n")
        outfile.write("* set ymin = ?ymin\n")
        outfile.write("* set zmin = ?zmin\n")
        outfile.write("*\n")
        outfile.write("\n")
        outfile.write("stop\n")


def split_and_process_pdb(pdb_file_path: str, output_dir: str):
    """
    Reads a PDB file, splits it into CHARMM segments (one per molecule, see
    read_raw_segments), processes each segment in memory, and writes each one
    to a separate file in the specified output directory.
    """
    with open(pdb_file_path, "r", encoding="utf-8") as pdb_file:
        segments = read_raw_segments(pdb_file.readlines())

    # Process each segment. Segments with no atoms left after filtering
    # (ion-only or water-only) are excluded from the CHARMM inp files, and
    # are dropped before naming so they do not use up a segment letter.
    non_empty_segments = []
    for chain_data in segments:
        processed_lines = remove_water(chain_data["lines"])
        processed_lines = remove_ions(processed_lines)
        processed_lines = remove_alt_conformers(processed_lines)
        processed_lines = apply_charmm_residue_names(processed_lines)

        # CHARMM will not tolerate HETATM lines
        processed_lines = replace_hetatm(processed_lines)

        if not any(line.startswith(("ATOM", "HETATM")) for line in processed_lines):
            # Water and ions after a chain's TER are common; only warn when
            # the whole chain is dropped
            if not any(
                s["chainid"] == chain_data["chainid"] and s is not chain_data
                for s in segments
            ):
                print(
                    f"WARNING: Chain {chain_data['chainid']} contained only ions/water "
                    f"and was skipped.",
                    file=sys.stderr,
                )
            continue

        chain_data["processed_lines"] = processed_lines
        chain_data["original_lines"] = chain_data["lines"]
        non_empty_segments.append(chain_data)

    # Determine molecule type for each segment and store detailed info
    for chain_data in non_empty_segments:
        molinfo = determine_molecule_type_details(chain_data["lines"])
        chain_data["molinfo"] = molinfo
        types_present = molinfo.get("types_present", set())
        first_type = molinfo.get("first_residue_type", "UNKNOWN")

        # Determine the segment type consistently using first_residue_type
        # This avoids non-deterministic set iteration order
        chain_data["type"] = "PRO" if types_present == {"PRO"} else first_type

        # Warn if segment contains mixed types or unknown residues
        if len(types_present) > 1:
            print(
                f"WARNING: Chain {chain_data['chainid']} contains mixed residue types: {types_present}. "
                f"Using {chain_data['type']} (first residue type)",
                file=sys.stderr,
            )
        elif "UNKNOWN" in types_present:
            print(
                f"WARNING: Chain {chain_data['chainid']} contains unrecognized residues (type={chain_data['type']})",
                file=sys.stderr,
            )

    assign_segids(non_empty_segments)
    warn_split_chains(non_empty_segments)

    for chain_data in non_empty_segments:
        segment_filename = get_segment_filename(chain_data["segid"], pdb_file_path)
        with open(
            os.path.join(output_dir, segment_filename), "w", encoding="utf-8"
        ) as segment_file:
            segment_file.writelines(chain_data["processed_lines"])
            segment_file.write("TER\n")
    # Write individual inp files for each non-empty segment
    write_pdb_2_crd_inp_files(non_empty_segments, output_dir, pdb_file_path)
    # Write file to meld them all
    write_meld_chain_crd_files(non_empty_segments, output_dir, pdb_file_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Split a PDB file into separate chain files for CHARMM."
    )
    parser.add_argument("pdb_file", type=str, help="Path to the PDB file to be split.")
    parser.add_argument(
        "output_dir", type=str, help="Directory to save the split chain files."
    )
    args = parser.parse_args()

    split_and_process_pdb(args.pdb_file, args.output_dir)
