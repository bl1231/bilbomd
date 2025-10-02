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

from pdb_utils import (
    classify_residue,
    determine_molecule_type_details,
    get_segid_renaming_map,
)

from helpers_viz import (
    Cluster,
    stride_downsample,
    write_viz_json,
    save_pae_bin,
    save_pae_png,
    save_viz_png,
)

MIN_CLUSTER_LENGTH = 5
CONST_FILE_PATH = "const.inp"

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


def _similarity_from_pae(
    pae_matrix: np.ndarray,
    method: str = "exp",
    sigma: float = 8.0,
    T: float = 30.0,
) -> np.ndarray:
    """Convert PAE (Å) to bounded similarity in [0,1].
    exp:    S = exp(-(PAE/sigma)^2)
    linear: S = max(0, 1 - PAE/T)
    """
    pae = np.asarray(pae_matrix, dtype=np.float64)
    if method == "exp":
        S = np.exp(-((pae / max(1e-9, sigma)) ** 2))
    else:
        S = 1.0 - (pae / max(1e-9, T))
        S[S < 0] = 0.0
    # zero self-similarity to avoid trivial dominance
    np.fill_diagonal(S, 0.0)
    return S


def _is_cross_chain(i: int, j: int, chain_segs: list) -> bool:
    """True if i and j lie on different chains given split indices (0-based, split BEFORE index)."""
    if not chain_segs:
        return False

    def chain_id(idx: int) -> int:
        c = 0
        for b in chain_segs:
            if idx > b:
                c += 1
            else:
                break
        return c

    return chain_id(i) != chain_id(j)


def _build_edges_from_similarity(
    S: np.ndarray,
    pae: np.ndarray,
    pae_cutoff: float,
    k: int,
    min_seq_sep: int,
    chain_segs: list,
    interchain_cutoff: float,
) -> tuple[list[tuple[int, int]], np.ndarray]:
    """Return (edges, weights) for igraph from similarity S with constraints.
    - Keep only edges with PAE ≤ pae_cutoff.
    - If k>0: per-row keep top-k neighbors by similarity (symmetrize).
    - Apply |i-j| ≥ min_seq_sep if min_seq_sep>0.
    - For cross-chain pairs, require PAE ≤ interchain_cutoff.
    """
    n = S.shape[0]
    mask = pae <= pae_cutoff
    if min_seq_sep and min_seq_sep > 0:
        ii, jj = np.indices((n, n))
        mask &= np.abs(ii - jj) >= min_seq_sep

    # Inter-chain stricter rule
    if chain_segs:
        for i in range(n):
            for j in range(n):
                if mask[i, j] and _is_cross_chain(i, j, chain_segs):
                    if pae[i, j] > interchain_cutoff:
                        mask[i, j] = False

    S_masked = np.where(mask, S, 0.0)

    if k and k > 0:
        edges_set: set[tuple[int, int]] = set()
        for i in range(n):
            row = S_masked[i]
            if not np.any(row):
                continue
            k_eff = min(k, n - 1)
            idx = np.argpartition(-row, kth=k_eff)[:k_eff]
            idx = [j for j in idx if row[j] > 0 and j != i]
            for j in idx:
                a, b = (i, j) if i < j else (j, i)
                edges_set.add((a, b))
        edges = sorted(edges_set)
        weights = np.array([S_masked[i, j] for (i, j) in edges], dtype=float)
        return edges, weights
    else:
        ii, jj = np.triu_indices(n, k=1)
        keep = S_masked[ii, jj] > 0
        edges = list(zip(ii[keep].tolist(), jj[keep].tolist()))
        weights = S_masked[ii[keep], jj[keep]].astype(float)
        return edges, weights


def define_clusters_for_selected_pae(
    pae_data,
    row_start: int,
    row_end: int,
    col_start: int,
    col_end: int,
    pae_power: float,
    *,
    graph_sim: str = "exp",
    sigma: float = 8.0,
    linear_T: float = 30.0,
    knn: int = 20,
    pae_cutoff: float = 10.0,
    min_seq_sep: int = 8,
    chain_segs: list | None = None,
    interchain_cutoff: float = 5.0,
    leiden_resolution: float = 1.0,
    leiden_iters: int = 10,
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

    selected = []
    for i, row in enumerate(matrix):
        if row_start <= i <= row_end:
            new_row = [
                value if col_start <= j <= col_end else 30.0
                for j, value in enumerate(row)
            ]
            selected.append(new_row)
    pae_matrix = np.array(selected, dtype=np.float64)

    # Build similarity and edges
    S = _similarity_from_pae(pae_matrix, method=graph_sim, sigma=sigma, T=linear_T)
    edges, sel_weights = _build_edges_from_similarity(
        S=S,
        pae=pae_matrix,
        pae_cutoff=pae_cutoff,
        k=knn,
        min_seq_sep=min_seq_sep,
        chain_segs=chain_segs or [],
        interchain_cutoff=interchain_cutoff,
    )

    g = igraph.Graph()
    size = pae_matrix.shape[0]
    g.add_vertices(range(size))
    if edges:
        g.add_edges(edges)
        g.es["weight"] = sel_weights

    vc = g.community_leiden(
        weights="weight" if edges else None,
        resolution=leiden_resolution,
        n_iterations=leiden_iters,
    )
    membership = np.array(vc.membership)

    membership_clusters = defaultdict(list)
    for index, cluster in enumerate(membership):
        membership_clusters[cluster].append(index)

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


def write_const_file(rigid_body_list: list, output_file, input_file: str = None):
    """
    Write const.inp file for CHARMM molecular dynamics jobs.

    Since PDB files are converted to CRD/PSF via pdb2crd.py, which renames chain segids
    (e.g., Protein chain A -> PROA, DNA chain Y -> DNAY), we apply the same renaming
    logic here to ensure segids in const.inp match those in the CRD/PSF files.
    """
    renaming = {}
    if input_file and input_file.endswith(".pdb"):
        renaming = get_segid_renaming_map(input_file)

    dock_count = 0
    rigid_body_count = 0
    with open(file=output_file, mode="w", encoding="utf8") as const_file:
        for rigid_body in rigid_body_list:
            rigid_body_count += 1
            p = 0
            n = 0
            for rigid_domain in rigid_body:
                start_residue = rigid_domain[0]
                end_residue = rigid_domain[1]
                segment = rigid_domain[2]
                # Apply renaming if available
                renamed_segment = renaming.get(segment, segment)
                if rigid_body_count == 1:
                    p += 1
                    const_file.write(
                        f"define fixed{p} sele ( resid {start_residue}:{end_residue}"
                        f" .and. segid {renamed_segment} ) end\n"
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
                        f" .and. segid {renamed_segment} ) end\n"
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
        "--graph_sim",
        type=str,
        choices=["exp", "linear"],
        default="exp",
        help="Similarity transform for PAE→weight (default: exp)",
    )
    parser.add_argument(
        "--sigma",
        type=float,
        default=8.0,
        help="Sigma (Å) for exp similarity: exp(-(PAE/sigma)^2)",
    )
    parser.add_argument(
        "--linear_T",
        type=float,
        default=30.0,
        help="T for linear similarity: max(0, 1 - PAE/T)",
    )
    parser.add_argument(
        "--knn",
        type=int,
        default=20,
        help="k for k-NN sparsification (per node). 0 disables and uses threshold graph",
    )
    parser.add_argument(
        "--pae_cutoff",
        type=float,
        default=10.0,
        help="Edge kept only if PAE ≤ cutoff (Å).",
    )
    parser.add_argument(
        "--min_seq_sep",
        type=int,
        default=8,
        help="Downweight/limit very short-range edges: require |i-j| ≥ this to include (0 to disable)",
    )
    parser.add_argument(
        "--interchain_cutoff",
        type=float,
        default=5.0,
        help="Allow cross-chain edges only if PAE ≤ this value (Å).",
    )
    parser.add_argument(
        "--leiden_resolution",
        type=float,
        default=1.0,
        help="Leiden resolution parameter γ (default 1.0)",
    )
    parser.add_argument(
        "--leiden_iters",
        type=int,
        default=10,
        help="Leiden iterations (default 10)",
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
        graph_sim=args.graph_sim,
        sigma=args.sigma,
        linear_T=args.linear_T,
        knn=args.knn,
        pae_cutoff=args.pae_cutoff,
        min_seq_sep=args.min_seq_sep,
        chain_segs=chain_segments,
        interchain_cutoff=args.interchain_cutoff,
        leiden_resolution=args.leiden_resolution,
        leiden_iters=args.leiden_iters,
    )

    input_struct = args.pdb_file if USE_PDB else args.crd_file
    rigid_bodies_from_pae = define_rigid_bodies(
        pae_clusters, input_struct, first_residue, chain_segments, args.plddt_cutoff
    )

    # --- Visualization artifacts start
    # 1) Build full PAE numpy matrix
    if "predicted_aligned_error" in pae_data:
        pae_full = np.array(pae_data["predicted_aligned_error"], dtype=np.float32)
    elif "pae" in pae_data:
        pae_full = np.array(pae_data["pae"], dtype=np.float32)
    else:
        raise ValueError("PAE data must contain 'predicted_aligned_error' or 'pae'")

    # 2) Determine L
    L = pae_full.shape[0]
    # 3) Downsample factor
    s = 2 if L > 1200 else 1
    pae_ds = stride_downsample(pae_full, s)

    # 4) Convert rigid_bodies_from_pae (list of lists of (start_residue, end_residue, segid)) into Cluster objects
    clusters = []
    if USE_PDB:
        # Build mapping from (chain_id, resseq) -> global 1-based index
        res_to_global = {}
        for idx, (chain_id, resseq) in enumerate(PDB_INDEX_TO_RES):
            res_to_global[(chain_id, resseq)] = idx + 1  # 1-based

        def tuple_to_global(tup):
            start_res, end_res, segid = tup
            # Find all indices in PDB_INDEX_TO_RES with matching (chain_id, resseq) in [start_res, end_res]
            # For each residue in that segment, get its global index
            # But since we want contiguous blocks, just get the global indices for start_res and end_res in this segid
            global_start = res_to_global.get((segid, start_res), None)
            global_end = res_to_global.get((segid, end_res), None)
            if global_start is None or global_end is None:
                # Try to fallback to string conversion if segid is not str
                global_start = res_to_global.get((str(segid), start_res), None)
                global_end = res_to_global.get((str(segid), end_res), None)
            return (global_start, global_end)

    else:
        # CRD mode: contiguous numbering
        first_crd = first_residue

        def tuple_to_global(tup):
            start_res, end_res, segid = tup
            global_start = start_res - first_crd + 1
            global_end = end_res - first_crd + 1
            return (global_start, global_end)

    for i, rb in enumerate(rigid_bodies_from_pae):
        # Each rb: list of tuples (start_res, end_res, segid)
        ranges = []
        for tup in rb:
            gstart, gend = tuple_to_global(tup)
            if gstart is not None and gend is not None:
                # 1-based inclusive
                ranges.append((gstart, gend))
        ctype = "fixed" if i == 0 else "rigid"
        clusters.append(Cluster(cid=i, ctype=ctype, ranges=ranges))

    # --- Compute chains spans (1-based inclusive) for viz.json
    chains = []
    if USE_PDB:
        # Walk the flattened residue index built earlier
        if not PDB_INDEX_TO_RES:
            _prepare_pdb_mappings(args.pdb_file)
        N = len(PDB_INDEX_TO_RES)
        if N > 0:
            cur_id = PDB_INDEX_TO_RES[0][0] or " "
            start = 1
            for i in range(2, N + 1):  # 1..N (1-based)
                prev_id = PDB_INDEX_TO_RES[i - 2][0] or " "
                curr_id = PDB_INDEX_TO_RES[i - 1][0] or " "
                if curr_id != prev_id:
                    chains.append(
                        {"id": prev_id, "start": int(start), "end": int(i - 1)}
                    )
                    start = i
            # close last span
            chains.append(
                {
                    "id": PDB_INDEX_TO_RES[-1][0] or " ",
                    "start": int(start),
                    "end": int(N),
                }
            )
    else:
        # CRD mode: scan segid per residue, compress to spans; map to global 1-based indices
        # (global index = resnum - first_residue + 1)
        mapping = []  # list of (resnum:int, segid:str)
        with open(file=args.crd_file, mode="r", encoding="utf8") as infile:
            start_processing = False
            for line in infile:
                if not start_processing:
                    if line.strip().endswith("EXT"):
                        start_processing = True
                    continue
                words = line.split()
                if len(words) >= 8:
                    try:
                        resnum = int(words[1])
                        segid = str(words[7])
                        mapping.append((resnum, segid))
                    except Exception:
                        continue
        mapping.sort(key=lambda t: t[0])
        if mapping:
            cur_seg = mapping[0][1]
            seg_start_resnum = mapping[0][0]
            prev_resnum = mapping[0][0]
            for resnum, segid in mapping[1:]:
                if segid != cur_seg:
                    chains.append(
                        {
                            "id": cur_seg,
                            "start": int(seg_start_resnum - first_residue + 1),
                            "end": int(prev_resnum - first_residue + 1),
                        }
                    )
                    cur_seg = segid
                    seg_start_resnum = resnum
                prev_resnum = resnum
            # close last span
            chains.append(
                {
                    "id": cur_seg,
                    "start": int(seg_start_resnum - first_residue + 1),
                    "end": int(prev_resnum - first_residue + 1),
                }
            )

    # 5) Write artifacts
    save_pae_bin("pae.bin", pae_ds)
    save_pae_png("pae.png", pae_ds)
    save_viz_png("viz.png", pae_ds, clusters)
    write_viz_json(
        "viz.json",
        length=L,
        clusters=clusters,
        plddt_cutoff=args.plddt_cutoff,
        low_conf=None,
        downsample=(s if s > 1 else None),
        chains=chains,
    )
    # --- Visualization artifacts end

    if args.emit_constraints:
        write_constraints_yaml(rigid_bodies_from_pae, args.emit_constraints)
    if not args.no_const:
        write_const_file(rigid_bodies_from_pae, CONST_FILE_PATH, input_struct)
    else:
        print("Skipping const.inp as requested (--no-const)")
    print("------------- done -------------")
