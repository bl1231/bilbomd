"""
Provides functions to create const.inp file from PAE and CRD files
"""

import argparse
import json
from collections import defaultdict
from typing import Tuple, Optional
import igraph
import numpy as np
import yaml

# This is defining the pLDDT threshold for determing flex/rigid
# which Alphafold2 writes to the B-factor column
# B_THRESHOLD = 50.00
# PAE_POWER = 2.0

MIN_CLUSTER_LENGTH = 5
CONST_FILE_PATH = "const.inp"
CLUSTER_FILE = "clusters.csv"
TEMP_FILE_JSON = "temp.json"

# --- PDB mode flag and caches ---
USE_PDB = False
# Indexed list mapping 0-based residue index -> (chain_id, resseq)
PDB_INDEX_TO_RES = []
# Per-residue pLDDT accumulator: (chain_id, resseq) -> [bfactors...]
PDB_RES_PLDDT = defaultdict(list)


def _prepare_pdb_mappings(pdb_file: str) -> int:
    """
    Build PDB_INDEX_TO_RES (sequence of residues across all chains) and
    PDB_RES_PLDDT (per-residue list of B-factors which hold pLDDT).
    Returns the number of residues discovered.
    """
    global PDB_INDEX_TO_RES, PDB_RES_PLDDT
    PDB_INDEX_TO_RES = []
    PDB_RES_PLDDT.clear()
    seen_res = set()  # track first atom per residue to build index ordering

    with open(file=pdb_file, mode="r", encoding="utf8") as fh:
        for line in fh:
            if not (line.startswith("ATOM") or line.startswith("HETATM")):
                continue
            # PDB fixed columns
            chain_id = line[21].strip() or " "
            resseq_str = line[22:26].strip()
            icode = line[26].strip()  # insertion code
            bfact_str = line[60:66].strip()

            if not resseq_str:
                continue
            try:
                resseq = int(resseq_str)
            except ValueError:
                continue

            # accumulate pLDDT (B-factor) per (chain, resseq)
            try:
                b = float(bfact_str)
                PDB_RES_PLDDT[(chain_id, resseq)].append(b)
            except Exception:
                pass

            # use (chain, resseq, icode) to identify first occurrence order
            key = (chain_id, resseq, icode)
            if key not in seen_res:
                seen_res.add(key)
                PDB_INDEX_TO_RES.append((chain_id, resseq))

    return len(PDB_INDEX_TO_RES)


def get_first_and_last_residue_numbers_pdb(pdb_file: str) -> Tuple[int, int]:
    """
    For PDB-based runs, we want indices that map 1..N so that SELECTED_* math
    yields 0..N-1 windows for the PAE slice.
    """
    n = _prepare_pdb_mappings(pdb_file)
    # Return (1, N) so first-1 == 0 and last-1 == N-1
    return 1, n


def define_segments_pdb(pdb_file: str):
    """
    Return 0-based residue indices that act as 'split points' between chains.
    For compatibility with the CRD-based logic, we return indices i-1 at chain
    boundaries so sort_and_separate_cluster() will break clusters at chain edges.
    """
    if not PDB_INDEX_TO_RES:
        _prepare_pdb_mappings(pdb_file)
    segs = []
    for i in range(1, len(PDB_INDEX_TO_RES)):
        prev_chain = PDB_INDEX_TO_RES[i - 1][0]
        curr_chain = PDB_INDEX_TO_RES[i][0]
        if prev_chain != curr_chain:
            segs.append(i - 1)
    return segs


def calculate_bfactor_avg_for_region_pdb(
    _ignored_file, first_index: int, last_index: int, _ignored_first_resnum: int
) -> float:
    """
    Average per-residue pLDDT (stored in B-factor) across the inclusive
    index range [first_index, last_index] in the flattened residue list.
    """
    if not PDB_INDEX_TO_RES:
        raise RuntimeError("PDB mappings not prepared.")
    vals = []
    for idx in range(first_index, last_index + 1):
        chain_id, resseq = PDB_INDEX_TO_RES[idx]
        arr = PDB_RES_PLDDT.get((chain_id, resseq), [])
        if arr:
            vals.append(sum(arr) / len(arr))
    return (sum(vals) / len(vals)) if vals else 0.0


def identify_new_rigid_domain_pdb(
    _ignored_file, first_index: int, last_index: int, _ignored_first_resnum: int
):
    """
    Return (start_residue, end_residue, segid) for the region defined by
    0-based indices. segid will be the PDB chain ID.
    """
    if not PDB_INDEX_TO_RES:
        raise RuntimeError("PDB mappings not prepared.")
    chain_start, res_start = PDB_INDEX_TO_RES[first_index]
    chain_end, res_end = PDB_INDEX_TO_RES[last_index]
    if chain_start != chain_end:
        # Should not happen because we split clusters at chain edges,
        # but guard anyway.
        return None
    segid = chain_start if chain_start else " "
    return (res_start, res_end, segid)


def get_first_and_last_residue_numbers(
    crd_file: str,
) -> Tuple[Optional[int], Optional[int]]:
    """
    Returns the first and last residue numbers from a CRD file. Ignores initial comment
    lines starting with '*', starts processing lines after a line ending in 'EXT'.

    :param crd_file: Path to the CRD file.
    :return: A tuple containing the first and last residue numbers. Returns None for
            each if not found.
    """
    first_resnum = None
    last_resnum = None
    start_processing = False  # Flag to indicate when to start processing lines

    with open(file=crd_file, mode="r", encoding="utf8") as infile:
        for line in infile:
            # Skip all lines until we find the line ending with 'EXT'
            # I hope this is univeral to all CRD files.
            if not start_processing:
                if line.strip().endswith("EXT"):
                    start_processing = True
                continue  # Skip current iteration and proceed to the next line

            words = line.split()
            # Start processing lines to find first and last residue numbers
            if start_processing and words:
                if first_resnum is None:
                    try:
                        first_resnum = int(
                            words[1]
                        )  # Assuming col 1 has the residue numbers
                    except ValueError:
                        continue  # Skip lines that do not start with an integer
                try:
                    # Continuously update last_resnum
                    last_resnum = int(words[1])
                except ValueError:
                    pass  # Ignore lines that do not start with an integer

    return first_resnum, last_resnum


def define_segments(crd_file: str):
    """
    Defines segments. But what is it actually doing?
    """
    differing_pairs = []
    with open(file=crd_file, mode="r", encoding="utf8") as infile:
        current_line = infile.readline().split()
        line_number = 1
        for line in infile:
            line_number += 1
            next_line = line.split()

            if (
                len(current_line) == 10
                and len(next_line) == 10
                and current_line[7] != next_line[7]
            ):
                differing_pairs.append(int(current_line[1]) - 1)
            current_line = next_line  # Move to the next line
    return differing_pairs


def correct_json_brackets(pae, output_file_path):
    """
    Removes the leading '[' and trailing ']' from a JSON-like string in the
    file, if present, and returns the corrected string.
    """
    with open(file=pae, mode="r", encoding="utf8") as infile:
        json_content = infile.read()
        if json_content.startswith("[") and json_content.endswith("]"):
            corrected_content = json_content[1:-1]
            return corrected_content
        else:
            return json_content


def define_clusters_for_selected_pae(
    pae_data,
    row_start: int,
    row_end: int,
    col_start: int,
    col_end: int,
    pae_power: float,
):
    """
    Define PAE clusters
    Accepts a dict (parsed JSON) instead of a filename.
    """
    data = pae_data
    if "pae" in data:
        matrix = data["pae"]
    elif "predicted_aligned_error" in data:
        matrix = data["predicted_aligned_error"]
    else:
        raise ValueError("Invalid PAE JSON format.")

    selected_matrix = []
    for i, row in enumerate(matrix):
        if row_start <= i <= row_end:
            new_row = [
                value if col_start <= j <= col_end else 30.0
                for j, value in enumerate(row)
            ]
            selected_matrix.append(new_row)

    selected_data = {"predicted_aligned_error": selected_matrix}

    if "predicted_aligned_error" not in selected_data:
        raise ValueError("Invalid PAE JSON format.")

    pae_matrix = np.array(selected_data["predicted_aligned_error"], dtype=np.float64)

    pae_cutoff = 10
    graph_resolution = 1
    # Avoid divide-by-zero by adding a small epsilon value to the denominator
    epsilon = 1e-6  # You can adjust this value based on your specific needs
    weights = 1 / (pae_matrix + epsilon) ** pae_power
    print(f"pae_power: {pae_power}")

    g = igraph.Graph()
    size = weights.shape[0]
    g.add_vertices(range(size))
    edges = np.argwhere(pae_matrix < pae_cutoff)
    sel_weights = weights[edges.T[0], edges.T[1]]
    g.add_edges(edges)
    g.es["weight"] = sel_weights

    vc = g.community_leiden(
        weights="weight", resolution=graph_resolution / 100, n_iterations=10
    )
    membership = np.array(vc.membership)

    membership_clusters = defaultdict(list)
    for index, cluster in enumerate(membership):
        membership_clusters[cluster].append(index)

    # Directly sort the cluster values by their length in descending order
    sorted_clusters = sorted(membership_clusters.values(), key=len, reverse=True)
    return sorted_clusters


def is_float(arg):
    """
    Returns True if arg can be converted to a float, False otherwise.
    """
    try:
        float(arg)
        return True
    except (ValueError, TypeError):
        return False


def sort_and_separate_cluster(numbers, chain_segs: list):
    """
    Sorts a list of numbers and separates them into contiguous regions.

    A "region" is defined as a sequence of consecutive numbers in the sorted list.
    The separation of regions occurs when a break in consecutiveness is detected,
    or when a number is found in the `chain_segs` list, which acts as a separator.

    Parameters:
    -----------
    numbers : list of int
        A list of integers that needs to be sorted and separated into regions.

    chain_segs : list of int
        A list of integers that serve as separators. When a number from `numbers`
        is found in `chain_segs`, it causes a break in the region, even if the
        numbers are otherwise consecutive.

    Returns:
    --------
    list of list of int
        A list of lists, where each inner list represents a contiguous region
        of numbers, excluding any breaks caused by numbers in `chain_segs`.

    Example:
    --------
    >>> sort_and_separate_cluster([1, 2, 3, 7, 8, 9, 11], [3, 8])
    [[1, 2], [3], [7], [8, 9], [11]]
    """
    numbers = sorted(numbers)
    regions = []
    current_region = [numbers[0]]
    for i in range(1, len(numbers)):
        if (numbers[i] == numbers[i - 1] + 1) and (numbers[i - 1] not in chain_segs):
            current_region.append(numbers[i])
        else:
            regions.append(current_region)
            current_region = [numbers[i]]

    regions.append(current_region)
    return regions


def find_and_update_sequential_rigid_domains(lists_of_tuples):
    """
    Identify and adjust adjacent rigid domains in a list of tuples.

    This function iterates over a list of lists, where each inner list contains tuples
    representing Rigid Domains. Each tuple consists of the start residue, end residue,
    and the chain identifier. The function identifies adjacent rigid domains within the
    same chain and adjusts them by creating a 2-residue gap between consecutive domains.
    The adjustment is done by decrementing the end of the first domain and incrementing
    the start of the second domain.

    Parameters:
    -----------
    lists_of_tuples : list of lists of tuples
        A list where each inner list contains tuples representing rigid domains. Each
        tuple is of the form (start_residue, end_residue, chain), where `start_residue`
        and `end_residue` are integers indicating the range of residues, and `chain` is
        a string representing the chain ID.

    Returns:
    --------
    tuple (bool, list of list of tuples)
        - A boolean indicating whether any updates were made to the rigid domains.
        - The updated list of lists containing the adjusted rigid domains.

    Example:
    --------
    Given a list of tuples representing rigid domains:

    >>> lists_of_tuples = [
    >>>     [(10, 20, "A"), (21, 30, "A")],
    >>>     [(5, 15, "B"), (16, 25, "B")]
    >>> ]

    The function will identify that (10, 20, "A") and (21, 30, "A") are adjacent and
    will update them to (10, 19, "A") and (22, 30, "A"), respectively, creating a
    2-residue gap between the domains.

    Collaboration Note:
    -------------------
    This function was collaboratively developed by ChatGPT and Scott

    """
    seen_pairs = set()  # To keep track of seen pairs and avoid duplicates
    updates = {}  # To store updates for each tuple
    updated = False  # Flag to indicate if updates were made
    print("-----------------")
    for outer_list in lists_of_tuples:
        for start1, end1, chain1 in outer_list:
            for other_outer_list in lists_of_tuples:
                for start2, end2, chain2 in other_outer_list:
                    if chain1 == chain2:
                        if end1 + 1 == start2:
                            # Ensure the pair is not considered in reverse
                            if (
                                (start1, end1, chain1),
                                (start2, end2, chain2),
                            ) not in seen_pairs:
                                print(
                                    f"Adjacent Rigid Domains: ({start1}, {end1}, '{chain1}') and ({start2}, {end2}, '{chain2}')"
                                )
                                updates[(start1, end1, chain1)] = (start1, end1 - 1)
                                updates[(start2, end2, chain2)] = (start2 + 1, end2)
                                seen_pairs.add(
                                    ((start1, end1, chain1), (start2, end2, chain2))
                                )
                                updated = True

                        elif end2 + 1 == start1:
                            if (
                                (start2, end2, chain2),
                                (start1, end1, chain1),
                            ) not in seen_pairs:
                                print(
                                    f"Adjacent Rigid Domains: ({start2}, {end2}, '{chain2}') and ({start1}, {end1}, '{chain1}')"
                                )
                                updates[(start2, end2, chain2)] = (start2, end2 - 1)
                                updates[(start1, end1, chain1)] = (start1 + 1, end1)
                                seen_pairs.add(
                                    ((start2, end2, chain2), (start1, end1, chain1))
                                )
                                updated = True

    # Apply the updates to the original list
    for i, outer_list in enumerate(lists_of_tuples):
        for j, (start, end, chain) in enumerate(outer_list):
            if (start, end, chain) in updates:
                new_start, new_end = updates[(start, end, chain)]
                lists_of_tuples[i][j] = (new_start, new_end, chain)

    return updated, lists_of_tuples


def calculate_bfactor_avg_for_region(
    crd_file, first_resnum_cluster, last_resnum_cluster, first_resnum
):
    """
    Calculate the average B-factor for a given cluster region.

    :param crd_file: Path to the CRD file (ignored for PDB mode).
    :param first_resnum_cluster: start index for region (0-based for PDB mode).
    :param last_resnum_cluster: end index for region (0-based for PDB mode).
    :param first_resnum: first residue number in the sequence (ignored for PDB mode).
    """
    if USE_PDB:
        return calculate_bfactor_avg_for_region_pdb(
            crd_file, first_resnum_cluster, last_resnum_cluster, first_resnum
        )
    bfactors = []
    with open(file=crd_file, mode="r", encoding="utf8") as infile:
        for line in infile:
            words = line.split()
            if len(words) >= 10 and is_float(words[9]) and not words[0].startswith("*"):
                bfactor = words[9]
                resnum = words[1]

                if (
                    float(bfactor) > 0.0
                    and bfactor.replace(".", "", 1).isdigit()
                    and int(resnum) >= first_resnum_cluster + first_resnum
                    and int(resnum) <= last_resnum_cluster + first_resnum
                ):
                    bfactors.append(float(bfactor))

    if bfactors:
        return sum(bfactors) / len(bfactors)
    else:
        return 0.0


def identify_new_rigid_domain(
    crd_file, first_resnum_cluster, last_resnum_cluster, first_resnum
):
    """
    Identify and return a new rigid domain as a tuple of
    (start_residue, end_residue, segment_id).
    """
    if USE_PDB:
        return identify_new_rigid_domain_pdb(
            crd_file, first_resnum_cluster, last_resnum_cluster, first_resnum
        )

    str1 = str2 = segid = None
    with open(file=crd_file, mode="r", encoding="utf8") as infile:
        for line in infile:
            words = line.split()
            if len(words) >= 10 and is_float(words[9]) and not words[0].startswith("*"):
                resnum = int(words[1])
                if resnum == first_resnum_cluster + first_resnum:
                    str1 = int(words[8])
                elif resnum == last_resnum_cluster + first_resnum:
                    str2 = int(words[8])
                    segid = words[7]

    if str1 is not None and str2 is not None and segid is not None:
        return (str1, str2, segid)
    return None


def define_rigid_bodies(
    clusters: list,
    crd_file: str,
    first_resnum: int,
    chain_segment_list: list,
    plddt_cutoff: float,
) -> list:
    """
    Define all Rigid Domains

    note:
    Rigid Bodies contain one of more Rigid Domains
    Rigid Domains are defined by a tuple of (start_residue, end_residue, segment_id)
    """
    # print(f"chain_segment_list: {chain_segment_list}")
    # print(f"first_resnum: {first_resnum}")
    # print(f"clusters: {clusters}")
    rigid_bodies = []
    for _, cluster in enumerate(clusters):
        rigid_body = []
        if len(cluster) >= MIN_CLUSTER_LENGTH:
            sorted_cluster = sort_and_separate_cluster(cluster, chain_segment_list)
            for region in sorted_cluster:
                first_resnum_cluster = region[0]
                last_resnum_cluster = region[-1]

                # Calculate the average B-factor for the current region
                bfactor_avg = calculate_bfactor_avg_for_region(
                    crd_file, first_resnum_cluster, last_resnum_cluster, first_resnum
                )

                # If the average B-factor is above the threshold, identify a new rigid domain
                if bfactor_avg > plddt_cutoff:
                    new_rigid_domain = identify_new_rigid_domain(
                        crd_file,
                        first_resnum_cluster,
                        last_resnum_cluster,
                        first_resnum,
                    )
                    if new_rigid_domain:
                        print(
                            f"New Rigid Domain: {new_rigid_domain} pLDDT: {round(bfactor_avg, 2)}"
                        )
                        rigid_body.append(new_rigid_domain)
            rigid_bodies.append(rigid_body)

    # remove empty lists from our list of lists of tuples
    all_non_empty_rigid_bodies = [cluster for cluster in rigid_bodies if cluster]
    print(f"Rigid Bodies: {all_non_empty_rigid_bodies}")

    # Now we need to make sure that none of the Rigid Domains (defined as tuples) are
    # adjacent to each other, and if they are, we need to adjust the start and end so
    # that we establish a 2 residue gap between them.
    updated = True
    while updated:
        updated, rigid_body_optimized = find_and_update_sequential_rigid_domains(
            all_non_empty_rigid_bodies
        )
    print(f"Optimized Rigid Bodies: {all_non_empty_rigid_bodies}")
    return rigid_body_optimized


def write_constraints_yaml(rigid_body_list: list, output_path: str):
    """Write constraints.yaml with schema expected by OpenMM steps.
    Schema:
    constraints:
      fixed_bodies: [{ name, segments: [{chain_id, residues:{start, stop}}] }]
      rigid_bodies: [{ name, segments: [{chain_id, residues:{start, stop}}] }]
    """

    def _segments_from_rigid_body(rb):
        return [
            {
                "chain_id": segid if isinstance(segid, str) else str(segid),
                "residues": {"start": int(start), "stop": int(stop)},
            }
            for (start, stop, segid) in rb
        ]

    fixed_bodies = []
    rigid_bodies = []
    if rigid_body_list:
        # First RB → fixed bodies
        fixed_bodies.append(
            {
                "name": "FixedBody1",
                "segments": _segments_from_rigid_body(rigid_body_list[0]),
            }
        )
        # Remaining RBs → rigid bodies
        for i, rb in enumerate(rigid_body_list[1:], start=1):
            rigid_bodies.append(
                {
                    "name": f"RigidBody{i}",
                    "segments": _segments_from_rigid_body(rb),
                }
            )

    data = {"constraints": {"fixed_bodies": fixed_bodies, "rigid_bodies": rigid_bodies}}
    with open(output_path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False)


def write_const_file(rigid_body_list: list, output_file):
    """
    Write const.inp file
    """
    dock_count = 0
    rigid_body_count = 0
    # print(f"rigid body list: {rigid_body_list}")
    with open(file=output_file, mode="w", encoding="utf8") as const_file:
        for rigid_body in rigid_body_list:
            # print(f"rigid_body: {rigid_body}")
            rigid_body_count += 1
            p = 0
            n = 0
            for rigid_domain in rigid_body:
                start_residue = rigid_domain[0]
                end_residue = rigid_domain[1]
                segment = rigid_domain[2]
                if rigid_body_count == 1:
                    p += 1
                    const_file.write(
                        f"define fixed{p} sele ( resid {start_residue}:{end_residue}"
                        f" .and. segid {segment} ) end\n"
                    )
                    if p == len(rigid_body):
                        const_file.write("cons fix sele ")
                        for number in range(1, p):
                            const_file.write(f"fixed{number} .or. ")
                        const_file.write(f"fixed{p} end \n")
                        const_file.write("\n")
                elif rigid_body_count > 1:
                    n += 1
                    const_file.write(
                        f"define rigid{n} sele ( resid {start_residue}:{end_residue}"
                        f" .and. segid {segment} ) end\n"
                    )
                    if n == len(rigid_body):
                        dock_count += 1
                        const_file.write(f"shape desc dock{dock_count} rigid sele ")
                        for number in range(1, n):
                            const_file.write(f"rigid{number} .or. ")
                        const_file.write(f"rigid{n} end \n")
                        const_file.write("\n")
        const_file.write("return \n")
        const_file.write("\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract PAE clusters and emit constraints for BilboMD (const.inp for CHARMM; optional constraints.yaml for OpenMM)."
    )
    parser.add_argument("pae_file", type=str, help="Path to the PAE JSON file.")

    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--crd_file", type=str, help="Path to a CRD file.")
    grp.add_argument(
        "--pdb_file", type=str, help="Path to a PDB file (preferred for OpenMM)."
    )

    parser.add_argument(
        "--pae_power",
        type=float,
        help="PAE power used to weight the community detection (default: 2.0)",
        default=2.0,
    )
    parser.add_argument(
        "--plddt_cutoff",
        type=float,
        help="pLDDT cutoff value to filter residues (default: 50.0)",
        default=50,
    )
    parser.add_argument(
        "--emit-constraints",
        type=str,
        help="If set, also write constraints YAML usable by OpenMM",
    )
    parser.add_argument(
        "--no-const",
        action="store_true",
        help="If set, do not write const.inp",
    )
    args = parser.parse_args()

    # Determine input mode

    USE_PDB = args.pdb_file is not None

    if USE_PDB:
        first_residue, last_residue = get_first_and_last_residue_numbers_pdb(
            args.pdb_file
        )
        chain_segments = define_segments_pdb(args.pdb_file)
    else:
        first_residue, last_residue = get_first_and_last_residue_numbers(args.crd_file)
        chain_segments = define_segments(args.crd_file)
    # print(f"here in main - {chain_segments}")
    SELECTED_ROWS_START = first_residue - 1
    SELECTED_ROWS_END = last_residue - 1
    SELECTED_COLS_START = SELECTED_ROWS_START
    SELECTED_COLS_END = SELECTED_ROWS_END

    # set global constant for pae_power
    PAE_POWER = args.pae_power

    # Read and correct PAE JSON in memory
    corrected_json_str = correct_json_brackets(args.pae_file, None)
    pae_data = json.loads(corrected_json_str)

    pae_clusters = define_clusters_for_selected_pae(
        pae_data,
        SELECTED_ROWS_START,
        SELECTED_ROWS_END,
        SELECTED_COLS_START,
        SELECTED_COLS_END,
        args.pae_power,
    )

    input_struct = args.pdb_file if USE_PDB else args.crd_file
    rigid_bodies_from_pae = define_rigid_bodies(
        pae_clusters, input_struct, first_residue, chain_segments, args.plddt_cutoff
    )

    if args.emit_constraints:
        write_constraints_yaml(rigid_bodies_from_pae, args.emit_constraints)
    if not args.no_const:
        write_const_file(rigid_bodies_from_pae, CONST_FILE_PATH)
    else:
        print("Skipping const.inp as requested (--no-const)")
    print("------------- done -------------")
