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

TOPO_FILES = os.environ.get("CHARMM_TOPOLOGY", "/app/scripts/bilbomd_top_par_files.str")


def determine_molecule_type_details(lines):
    """
    Returns a dictionary with molecule type info for the chain:
    - types_present: Set of molecule types found in the chain
    - first_residue_type: Molecule type of the first residue
    - last_residue_type: Molecule type of the last residue
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

    def classify_residue(residue):
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


def get_chain_filename(chain_id, pdb_filename):
    """
    Generates a filename for the chain file. Appends '_uc' to the filename
    for uppercase chain IDs to differentiate from lowercase ones, since CHARMM
    requires lowercase filenames in all input files.

    :param chain_id: The chain ID from the PDB file.
    :param pdb_filename: The original PDB filename.
    :param output_dir: The output directory for the chain files.
    :return: A string representing the filename for the chain file.
    """
    # Check if the chain ID is uppercase and append '_uc' if true
    suffix = "_uc" if chain_id.isupper() else ""
    # Construct the filename using the lowercase chain ID and suffix if applicable
    chain_filename = f"{chain_id.lower()}{suffix}_{pdb_filename.split('/')[-1].lower()}"
    return chain_filename


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


def write_pdb_2_crd_inp_files(chains, output_dir, pdb_file_path):
    """
    Write individual CHARMM input file to convert each chain to a CRD and PSF file.
    """
    charmm_gen_options = {
        "PRO": "setup warn first none last none",
        "DNA": "setup warn first 5TER last 3TER",
        "RNA": "setup warn first 5TER last 3TER",
        "CAR": "setup",
    }
    for chain_id, chain_data in chains.items():
        molecule_type = chain_data["type"]
        # our little hack to always use lower case file name for CHARMM
        suffix = "_uc" if chain_id.isupper() else ""
        # input filename:
        input_filename = os.path.basename(pdb_file_path)
        # Get the base filename without extension
        base_filename = os.path.splitext(os.path.basename(pdb_file_path))[0].lower()
        chain_filename = f"{chain_id.lower()}{suffix}_{base_filename}"
        # need to account for CAR vs CAL.... only for Carbohydrates at the moment.
        # but should probably make this work for Protein and DNA/RNA
        # CAR is for uppercase Chain IDs
        # CAL is for lowercase Chain IDs
        if molecule_type == "CAR":
            carb_suffix = "R" if chain_id.isupper() else "L"

            charmmgui_chain_id = f"CA{carb_suffix}{chain_data['chainid'].upper()}"
        else:
            charmmgui_chain_id = f"{molecule_type}{chain_data['chainid']}"

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
            outfile.write(f"open unit 1 read card name {chain_filename}.pdb\n")
            outfile.write("read sequ pdb unit 1\n")

            outfile.write("rewind unit 1\n")
            # Enhanced CHARMM generate line
            molinfo = chain_data.get("molinfo", {})
            types_present = molinfo.get("types_present", set())
            last_type = molinfo.get("last_residue_type", "UNKNOWN")

            if types_present == {"PRO"} and last_type == "PRO":
                gen_opts = "setup warn first NTER last CTER"
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


def write_meld_chain_crd_files(chains, output_dir, pdb_file_path):
    """
    Melds individual chain CRD files into a single CRD file for subsequent CHARMM steps
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
        for chain_id, chain_data in chains.items():
            molecule_type = chain_data["type"]
            # need to account for CAR vs CAL.... only for Carbohydrates at the moment.
            # but should probably make this work for Protein and DNA/RNA
            # CAR is for uppercase Chain IDs A-Z
            # CAL is for lowercase Chain IDs a-z
            if molecule_type == "CAR":
                carb_suffix = "R" if chain_id.isupper() else "L"
                charmmgui_chain_id = f"CA{carb_suffix}{chain_data['chainid'].upper()}"
            else:
                charmmgui_chain_id = f"{molecule_type}{chain_data['chainid']}"

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
    Reads a PDB file, splits it by chains, processes each chain in memory,
    and writes each chain to a separate file in the specified output directory.
    """
    chains = {}  # Dictionary to hold chain data, key = chain ID, value = list of lines
    # Assuming `chains` is a dictionary where each key is a chain ID,
    # and each value is now a dictionary with 'lines' and 'type' keys.
    # chains[chain_id] = {"lines": [], "type": None}

    with open(pdb_file_path, "r", encoding="utf-8") as pdb_file:
        for line in pdb_file:
            if line.startswith(("ATOM", "HETATM")):
                # record_type = line[:6].strip()  # ATOM or HETATM
                chain_id = line[21]  # Chain ID

                # Create a unique key for each chain that includes both chain ID and
                #  record type
                # unique_chain_key = f"{record_type}_{chain_id}"
                unique_chain_key = f"pdb2crd_chain_{chain_id}"

                # Initialize the chain in the dictionary if not already present
                if unique_chain_key not in chains:
                    chains[unique_chain_key] = {
                        "lines": [],
                        "original_lines": [],
                        "type": None,
                        "chainid": chain_id,
                    }
                chains[unique_chain_key]["lines"].append(line)
                chains[unique_chain_key]["original_lines"].append(line)

    # Determine molecule type for each chain and store detailed info
    for chain_id, chain_data in chains.items():
        molinfo = (
            determine_molecule_type_details(chain_data["lines"])
            if "lines" in chain_data
            else {}
        )
        chain_data["molinfo"] = molinfo
        types_present = molinfo.get("types_present", set())
        chain_data["type"] = (
            "PRO" if types_present == {"PRO"} else next(iter(types_present), "UNKNOWN")
        )

    # Process and write each chain to a separate file
    for chain_id, chain_data in chains.items():
        # Apply any processing here, e.g., renaming residues, renumbering, etc.
        # These could be done in a single for x in x loop if we wanted
        # to be more efficient
        processed_lines = remove_water(chain_data["lines"])
        processed_lines = remove_alt_conformers(processed_lines)
        processed_lines = apply_charmm_residue_names(processed_lines)

        # CHARMM will not tolerate HETATM lines
        processed_lines = replace_hetatm(processed_lines)

        chain_filename = get_chain_filename(chain_id, pdb_file_path)

        with open(
            output_dir + "/" + chain_filename, "w", encoding="utf-8"
        ) as chain_file:
            chain_file.writelines(processed_lines)
            chain_file.write("TER\n")
    # Write individual inp files for each chain
    write_pdb_2_crd_inp_files(chains, output_dir, pdb_file_path)
    # Write file to meld them all
    write_meld_chain_crd_files(chains, output_dir, pdb_file_path)


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
