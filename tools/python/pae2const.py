"""
Provides functions to create CHARMM const.inp or OpenMM constraints.yaml file from PAE and CRD files
"""

import argparse
import json
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import igraph
import numpy as np
import yaml

from helpers_viz import (
    Cluster,
    save_pae_bin,
    save_pae_png,
    save_viz_png,
    stride_downsample,
    write_viz_json,
)
from pdb_utils import get_segid_renaming_map

# Constants
CONST_FILE_PATH = "const.inp"
MIN_CLUSTER_LENGTH = 3
PDB_INDEX_TO_RES = []
PDB_RES_PLDDT = defaultdict(list)
USE_PDB = False  # Will be set in main


class InputHandler(ABC):
    @abstractmethod
    def get_first_and_last_residue_numbers(
        self, file: str
    ) -> Tuple[Optional[int], Optional[int]]:
        pass

    @abstractmethod
    def define_segments(self, file: str) -> List[int]:
        pass

    @abstractmethod
    def calculate_bfactor_avg_for_region(
        self, file: str, first_index: int, last_index: int, first_resnum: int
    ) -> float:
        pass

    @abstractmethod
    def identify_new_rigid_domain(
        self, file: str, first_index: int, last_index: int, first_resnum: int
    ) -> Optional[Tuple[int, int, str, float]]:
        pass

    @abstractmethod
    def get_tuple_to_global_mapper(self, first_residue: int) -> callable:
        pass

    @abstractmethod
    def get_chains(self, file: str, first_residue: int) -> List[Dict[str, Any]]:
        pass


class PDBHandler(InputHandler):
    def __init__(self):
        self.pdb_index_to_res = []
        self.pdb_res_plddt = defaultdict(list)

    def _prepare_pdb_mappings(self, pdb_file: str) -> int:
        """
        Build pdb_index_to_res (sequence of residues across all chains) and
        pdb_res_plddt (per-residue list of B-factors which hold pLDDT).
        Returns the number of residues discovered.

        This populates self.pdb_index_to_res and self.pdb_res_plddt.
        Also sets global PDB_INDEX_TO_RES and PDB_RES_PLDDT for compatibility.
        """
        pdb_path = Path(pdb_file)
        if not pdb_path.exists():
            raise FileNotFoundError(f"PDB file not found: {pdb_file}")

        self.pdb_index_to_res.clear()
        self.pdb_res_plddt.clear()
        seen_res = set()  # Track first atom per residue to build index ordering

        with open(pdb_path, "r", encoding="utf-8") as fh:
            for line in fh:
                if not (line.startswith("ATOM") or line.startswith("HETATM")):
                    continue
                # PDB fixed columns
                chain_id = line[21].strip() or " "
                resseq_str = line[22:26].strip()
                icode = line[26].strip()  # Insertion code
                bfact_str = line[60:66].strip()

                if not resseq_str:
                    continue
                try:
                    resseq = int(resseq_str)
                except ValueError:
                    continue

                # Accumulate pLDDT (B-factor) per (chain, resseq)
                try:
                    b = float(bfact_str)
                    self.pdb_res_plddt[(chain_id, resseq)].append(b)
                except ValueError:
                    pass

                # Use (chain, resseq, icode) to identify first occurrence order
                key = (chain_id, resseq, icode)
                if key not in seen_res:
                    seen_res.add(key)
                    self.pdb_index_to_res.append((chain_id, resseq))

        # Set globals for compatibility
        global PDB_INDEX_TO_RES, PDB_RES_PLDDT
        PDB_INDEX_TO_RES = self.pdb_index_to_res[:]
        PDB_RES_PLDDT = self.pdb_res_plddt.copy()

        return len(self.pdb_index_to_res)

    def get_first_and_last_residue_numbers(self, pdb_file: str) -> Tuple[int, int]:
        """
        For PDB-based runs, return (1, N) for 1-based indexing.
        """
        n = self._prepare_pdb_mappings(pdb_file)
        return 1, n  # First-1 == 0, last-1 == N-1

    def define_segments(self, pdb_file: str) -> List[int]:
        """
        Return 0-based residue indices that act as 'split points' between chains.
        """
        if not self.pdb_index_to_res:
            self._prepare_pdb_mappings(pdb_file)

        segs = []
        for i in range(1, len(self.pdb_index_to_res)):
            prev_chain = self.pdb_index_to_res[i - 1][0]
            curr_chain = self.pdb_index_to_res[i][0]
            if prev_chain != curr_chain:
                segs.append(i - 1)
        return segs

    def calculate_bfactor_avg_for_region(
        self,
        _ignored_file: str,
        first_index: int,
        last_index: int,
        _ignored_first_resnum: int,
    ) -> float:
        """
        Average per-residue pLDDT (stored in B-factor) across the inclusive
        index range [first_index, last_index] in the flattened residue list.
        """
        if not self.pdb_index_to_res:
            raise RuntimeError("PDB mappings not prepared.")
        vals = []
        for idx in range(first_index, last_index + 1):
            chain_id, resseq = self.pdb_index_to_res[idx]
            arr = self.pdb_res_plddt.get((chain_id, resseq), [])
            if arr:
                vals.append(sum(arr) / len(arr))
        return (sum(vals) / len(vals)) if vals else 0.0

    def identify_new_rigid_domain(
        self,
        _ignored_file: str,
        first_index: int,
        last_index: int,
        _ignored_first_resnum: int,
    ) -> Optional[Tuple[int, int, str, float]]:
        """
        Return (start_residue, end_residue, segid, avg_plddt) for the region defined by
        0-based indices. segid will be the PDB chain ID. avg_plddt is placeholder, will be overridden.
        """
        if not self.pdb_index_to_res:
            raise RuntimeError("PDB mappings not prepared.")
        chain_start, res_start = self.pdb_index_to_res[first_index]
        chain_end, res_end = self.pdb_index_to_res[last_index]
        if chain_start != chain_end:
            # Should not happen because we split clusters at chain edges,
            # but guard anyway.
            return None
        segid = chain_start if chain_start else " "
        return (res_start, res_end, segid, 0.0)

    def get_tuple_to_global_mapper(self, first_residue: int) -> callable:
        """Return a function that maps (start_res, end_res, segid) -> (gstart, gend) in 1-based global indices."""
        # Build mapping from (chain_id, resseq) -> global 1-based index
        res_to_global = {}
        for idx, (chain_id, resseq) in enumerate(self.pdb_index_to_res):
            res_to_global[(chain_id, resseq)] = idx + 1
            # also allow string-casted chain ids
            res_to_global[(str(chain_id), resseq)] = idx + 1

        def _map_pdb(tup):
            start_res, end_res, segid = tup
            gs = res_to_global.get((segid, start_res))
            ge = res_to_global.get((segid, end_res))
            return (gs, ge)

        return _map_pdb

    def get_chains(self, pdb_file: str, first_residue: int) -> List[Dict[str, Any]]:
        """Compute chains spans (1-based inclusive) for viz.json"""
        if not self.pdb_index_to_res:
            self._prepare_pdb_mappings(pdb_file)
        chains = []
        N = len(self.pdb_index_to_res)
        if N > 0:
            start = 1
            for i in range(2, N + 1):  # 1..N (1-based)
                prev_id = self.pdb_index_to_res[i - 2][0] or " "
                curr_id = self.pdb_index_to_res[i - 1][0] or " "
                if curr_id != prev_id:
                    chains.append(
                        {"id": prev_id, "start": int(start), "end": int(i - 1)}
                    )
                    start = i
            # close last span
            chains.append(
                {
                    "id": self.pdb_index_to_res[-1][0] or " ",
                    "start": int(start),
                    "end": int(N),
                }
            )
        return chains


class CRDHandler(InputHandler):
    def get_first_and_last_residue_numbers(
        self, crd_file: str
    ) -> Tuple[Optional[int], Optional[int]]:
        """
        Extract first and last residue numbers from a CRD file.
        """
        crd_path = Path(crd_file)
        if not crd_path.exists():
            raise FileNotFoundError(f"CRD file not found: {crd_file}")

        first_resnum = None
        last_resnum = None
        start_processing = False

        with open(crd_path, "r", encoding="utf-8") as infile:
            for line in infile:
                if not start_processing:
                    if line.strip().endswith("EXT"):
                        start_processing = True
                    continue

                words = line.split()
                if start_processing and words:
                    if first_resnum is None:
                        try:
                            first_resnum = int(words[1])
                        except (ValueError, IndexError):
                            continue
                    try:
                        last_resnum = int(words[1])
                    except (ValueError, IndexError):
                        pass

        return first_resnum, last_resnum

    def define_segments(self, crd_file: str) -> List[int]:
        """
        Define segments by detecting differing segids in CRD file.
        """
        crd_path = Path(crd_file)
        if not crd_path.exists():
            raise FileNotFoundError(f"CRD file not found: {crd_file}")

        differing_pairs = []
        current_line = None

        with open(crd_path, "r", encoding="utf-8") as infile:
            for line in infile:
                line_split = line.split()
                if current_line is None:
                    current_line = line_split
                    continue

                if (
                    len(current_line) == 10
                    and len(line_split) == 10
                    and current_line[7] != line_split[7]
                ):
                    differing_pairs.append(int(current_line[1]) - 1)
                current_line = line_split

        return differing_pairs

    def calculate_bfactor_avg_for_region(
        self, file: str, first_index: int, last_index: int, first_resnum: int
    ) -> float:
        """
        Calculate the average B-factor for a given cluster region in CRD.
        """
        bfactors = []
        with open(file=file, mode="r", encoding="utf8") as infile:
            for line in infile:
                words = line.split()
                if len(words) >= 10 and not words[0].startswith("*"):
                    try:
                        bfactor = float(words[9])
                        resnum = int(words[1])
                        if (
                            bfactor > 0.0
                            and str(bfactor).replace(".", "", 1).isdigit()
                            and resnum >= first_index + first_resnum
                            and resnum <= last_index + first_resnum
                        ):
                            bfactors.append(bfactor)
                    except (ValueError, TypeError):
                        pass

        if bfactors:
            return sum(bfactors) / len(bfactors)
        else:
            return 0.0

    def identify_new_rigid_domain(
        self, file: str, first_index: int, last_index: int, first_resnum: int
    ) -> Optional[Tuple[int, int, str, float]]:
        """
        Identify and return a new rigid domain as a tuple of
        (start_residue, end_residue, segment_id, avg_plddt).
        """
        str1 = str2 = segid = None
        with open(file=file, mode="r", encoding="utf8") as infile:
            for line in infile:
                words = line.split()
                if len(words) >= 10 and not words[0].startswith("*"):
                    try:
                        float(words[9])  # just to check
                        resnum = int(words[1])
                        if resnum == first_index + first_resnum:
                            str1 = int(words[8])
                        elif resnum == last_index + first_resnum:
                            str2 = int(words[8])
                            segid = words[7]
                    except (ValueError, TypeError):
                        pass

        if str1 is not None and str2 is not None and segid is not None:
            return (str1, str2, segid, 0.0)
        return None

    def get_tuple_to_global_mapper(self, first_residue: int) -> callable:
        first_crd = first_residue

        def _map_crd(tup):
            start_res, end_res, _seg = tup
            gs = start_res - first_crd + 1
            ge = end_res - first_crd + 1
            return (gs, ge)

        return _map_crd

    def get_chains(self, file: str, first_residue: int) -> List[Dict[str, Any]]:
        """Compute chains spans (1-based inclusive) for viz.json"""
        mapping = []  # list of (resnum:int, segid:str)
        with open(file=file, mode="r", encoding="utf8") as infile:
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
        chains = []
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
        return chains


@dataclass
class PAEConfig:
    plddt_cutoff: float = 50.0
    graph_sim: str = "exp"
    sigma: float = 10.0
    linear_T: float = 30.0
    knn: int = 0
    knn_mode: str = "union"
    pae_cutoff: float = 10.0
    min_seq_sep: int = 4
    interchain_cutoff: float = 5.0
    leiden_resolution: float = 0.35
    leiden_iters: int = 10
    merge_tau: float = 7.0
    merge_coverage: float = 0.6
    cross_merge_tau: float = 15.0
    cross_merge_coverage: float = 0.7
    cross_merge_mode: str = "adjacent"
    min_segment_len: int = 6

    # Output settings (optional, for flexibility)
    emit_constraints: Optional[str] = None  # Path for YAML output
    no_const: bool = False  # Flag to skip const.inp

    def __post_init__(self):
        """Validate user-provided configuration values.
        These checks mirror expected numeric ranges for PAE/plddt units and guard
        against combinations that would lead to pathological graphs or merges.
        """
        # --- basic scalar ranges
        if not (0.0 <= float(self.plddt_cutoff) <= 100.0):
            raise ValueError("plddt_cutoff must be in [0, 100]")

        if self.graph_sim not in {"exp", "linear"}:
            raise ValueError("graph_sim must be 'exp' or 'linear'")

        if self.graph_sim == "exp":
            if not (1.0 <= float(self.sigma) <= 50.0):
                raise ValueError("sigma must be in [1, 50] when graph_sim='exp'")
        else:  # linear
            if not (1.0 <= float(self.linear_T) <= 100.0):
                raise ValueError("linear_T must be in [1, 100] when graph_sim='linear'")

        if int(self.knn) < 0:
            raise ValueError("knn must be a non-negative integer")
        if self.knn_mode not in {"union", "mutual"}:
            raise ValueError("knn_mode must be 'union' or 'mutual'")
        if self.knn_mode == "mutual" and int(self.knn) == 0:
            raise ValueError("knn_mode='mutual' requires knn > 0")

        if not (0.0 < float(self.pae_cutoff) <= 50.0):
            raise ValueError("pae_cutoff must be in (0, 50]")
        if int(self.min_seq_sep) < 0:
            raise ValueError("min_seq_sep must be ≥ 0")

        if not (0.0 < float(self.interchain_cutoff) <= 50.0):
            raise ValueError("interchain_cutoff must be in (0, 50]")

        if not (0.0 < float(self.leiden_resolution) <= 1.0):
            raise ValueError("leiden_resolution must be in (0, 1]")
        if int(self.leiden_iters) < 1:
            raise ValueError("leiden_iters must be ≥ 1")

        if not (0.0 < float(self.merge_tau) <= 50.0):
            raise ValueError("merge_tau must be in (0, 50]")
        if not (0.0 <= float(self.merge_coverage) <= 1.0):
            raise ValueError("merge_coverage must be in [0, 1]")

        if not (0.0 < float(self.cross_merge_tau) <= 50.0):
            raise ValueError("cross_merge_tau must be in (0, 50]")
        if not (0.0 <= float(self.cross_merge_coverage) <= 1.0):
            raise ValueError("cross_merge_coverage must be in [0, 1]")

        if self.cross_merge_mode not in {"adjacent", "any"}:
            raise ValueError("cross_merge_mode must be 'adjacent' or 'any'")

        if int(self.min_segment_len) < 1:
            raise ValueError("min_segment_len must be ≥ 1")

        # --- relationships between parameters
        # Inter-chain cutoff should not be looser than global PAE edge cutoff
        if float(self.interchain_cutoff) > float(self.pae_cutoff):
            raise ValueError(
                "interchain_cutoff should be ≤ pae_cutoff (it's meant to be stricter for cross-chain edges)"
            )

        # Usually cross_merge thresholds are stricter than same-chain; warn if reversed.
        # Don't hard-error—just normalize expectations.
        if float(self.cross_merge_tau) > float(self.merge_tau):
            # Not raising; allow advanced use but warn via ValueError only if really extreme.
            pass

        # If knn==0 we are using a thresholded dense graph; keep pae_cutoff reasonable
        if int(self.knn) == 0 and float(self.pae_cutoff) > 30.0:
            # Prevent near-complete graphs that explode clustering time
            raise ValueError(
                "When knn=0, pae_cutoff should be ≤ 30 to avoid overly dense graphs"
            )

        # Sanity: sigma/linear_T shouldn't be both tiny and produce near-binary weights
        if (
            self.graph_sim == "exp"
            and float(self.sigma) < 2.0
            and float(self.pae_cutoff) >= 10.0
        ):
            # Very sharp kernel with a high edge cutoff tends to create unstable graphs
            pass


class PAEProcessor:
    def __init__(self, config: PAEConfig):
        self.input_handler = None
        self.pae_data = {}
        self.clusters = []
        self.global_merged_flags = []
        self.rigid_bodies = []
        self.rigid_body_flags = []
        self.first_residue = None
        self.last_residue = None
        self.chain_segments = []
        self.input_file = None
        self.config = config

    def load_pae_data(self, pae_file: str) -> None:
        """
        Load and correct PAE JSON data from file, storing it in self.pae_data.

        Corrects JSON by removing leading/trailing brackets if present.
        """
        pae_path = Path(pae_file)
        if not pae_path.exists():
            raise FileNotFoundError(f"PAE file not found: {pae_file}")

        with open(pae_path, "r", encoding="utf-8") as infile:
            json_content = infile.read()
            if json_content.startswith("[") and json_content.endswith("]"):
                corrected_content = json_content[1:-1]
            else:
                corrected_content = json_content

        try:
            self.pae_data = json.loads(corrected_content)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in PAE file {pae_file}: {e}")

    def validate_alignment(self) -> None:
        """
        Validate that the input structure (PDB/CRD) aligns with the PAE matrix.
        Checks performed:
          1) PAE is square (LxL)
          2) Expected residue count from input (last-first+1) equals L
          3) Chain-segment split indices are in-range and increasing
        Raises ValueError with actionable detail if validation fails.
        """
        # 1) Load PAE as ndarray and verify square
        if "predicted_aligned_error" in self.pae_data:
            pae_full = np.array(
                self.pae_data["predicted_aligned_error"], dtype=np.float32
            )
        elif "pae" in self.pae_data:
            pae_full = np.array(self.pae_data["pae"], dtype=np.float32)
        else:
            raise ValueError("PAE data must contain 'predicted_aligned_error' or 'pae'")

        if pae_full.ndim != 2 or pae_full.shape[0] != pae_full.shape[1]:
            raise ValueError(
                f"PAE must be a square matrix, got shape {pae_full.shape}."
            )
        L = int(pae_full.shape[0])

        # 2) Determine expected residue count from input handler
        if self.first_residue is None or self.last_residue is None:
            raise ValueError(
                "first_residue/last_residue not set before alignment validation."
            )
        expected_len = int(self.last_residue - self.first_residue + 1)
        if expected_len <= 0:
            raise ValueError(
                f"Invalid residue span from input file: first={self.first_residue}, last={self.last_residue}."
            )

        # PDB safety: ensure handler prepared mappings (should be true if get_first_and_last_residue_numbers ran)
        if isinstance(self.input_handler, PDBHandler):
            # _prepare_pdb_mappings was called inside get_first_and_last_residue_numbers
            mapped_len = len(self.input_handler.pdb_index_to_res)
            if mapped_len and mapped_len != expected_len:
                # This should never happen; keep it as a guardrail.
                raise ValueError(
                    f"PDB mapping length mismatch: mapping={mapped_len}, span={expected_len} "
                    f"(first={self.first_residue}, last={self.last_residue})."
                )

        # 3) Compare lengths
        if expected_len != L:
            raise ValueError(
                "Input structure length does not match PAE matrix.\n"
                f"- PAE length (L): {L}\n"
                f"- Structure residue span: first={self.first_residue}, last={self.last_residue}, count={expected_len}\n"
                "Please ensure the PAE JSON corresponds to this structure (same sequence/truncation/chains)."
            )

        # 4) Chain segment sanity checks: indices must be strictly increasing and in range [0, L-2]
        if self.chain_segments:
            segs = list(self.chain_segments)
            if any((not isinstance(x, (int, np.integer))) for x in segs):
                raise ValueError(f"chain_segments must be integers, got: {segs}")
            if segs != sorted(segs):
                raise ValueError(
                    f"chain_segments must be sorted ascending, got: {segs}"
                )
            if any(x < 0 or x >= L - 1 for x in segs):
                raise ValueError(
                    f"chain_segments out of range for PAE length {L}: {segs}. "
                    "Split points are 0-based indices that mark the last residue of a chain."
                )

        # If we got here, basic alignment checks passed
        print(
            f"[validate] Input aligns with PAE: L={L}, residues={expected_len}, chainsplits={len(self.chain_segments or [])}"
        )

    def get_first_and_last_residue_numbers(
        self, file: str
    ) -> Tuple[Optional[int], Optional[int]]:
        """
        Unified method to get first and last residue numbers from PDB or CRD file.

        Delegates to the input handler.
        """
        return self.input_handler.get_first_and_last_residue_numbers(file)

    def define_segments(self, file: str) -> List[int]:
        """
        Unified method to define chain segments (0-based split indices).

        Delegates to the input handler.
        """
        return self.input_handler.define_segments(file)

    def define_clusters(self):
        row_start = self.first_residue - 1
        row_end = self.last_residue - 1
        col_start = row_start
        col_end = row_end
        self.clusters, self.global_merged_flags = (
            self._define_clusters_for_selected_pae(
                row_start,
                row_end,
                col_start,
                col_end,
            )
        )

    def _define_clusters_for_selected_pae(
        self,
        row_start: int,
        row_end: int,
        col_start: int,
        col_end: int,
    ):
        """
        Define PAE clusters using Leiden algorithm.
        Moved from standalone function; now uses self.config for parameters.
        """
        data = self.pae_data
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

        # Build similarity and edges (using self.config)
        S = self._similarity_from_pae(
            pae_matrix,
            method=self.config.graph_sim,
            sigma=self.config.sigma,
            T=self.config.linear_T,
        )
        S = 0.5 * (S + S.T)  # Symmetrize
        edges, sel_weights = self._build_edges_from_similarity(
            S=S,
            pae=pae_matrix,
            pae_cutoff=self.config.pae_cutoff,
            k=self.config.knn,
            min_seq_sep=self.config.min_seq_sep,
            chain_segs=self.chain_segments or [],
            interchain_cutoff=self.config.interchain_cutoff,
            knn_mode=self.config.knn_mode,
        )

        g = igraph.Graph()
        size = pae_matrix.shape[0]
        g.add_vertices(range(size))
        if edges:
            g.add_edges(edges)
            g.es["weight"] = sel_weights

        print(
            f"[clustering] n={size}, edges={len(edges)}, "
            f"knn={self.config.knn}, cutoff={self.config.pae_cutoff}, interchain_cutoff={self.config.interchain_cutoff}, "
            f"min_seq_sep={self.config.min_seq_sep}"
        )

        vc = g.community_leiden(
            weights="weight" if edges else None,
            resolution=self.config.leiden_resolution,
            n_iterations=self.config.leiden_iters,
        )
        membership = np.array(vc.membership)

        membership_clusters = defaultdict(list)
        for index, cluster in enumerate(membership):
            membership_clusters[cluster].append(index)

        sorted_clusters = sorted(membership_clusters.values(), key=len, reverse=True)
        sorted_clusters, global_merged_flags = self._merge_clusters_by_affinity(
            pae_matrix,
            sorted_clusters,
            self.chain_segments or [],
            tau=self.config.merge_tau,
            cov=self.config.merge_coverage,
            tau_cross=self.config.cross_merge_tau,
            cov_cross=self.config.cross_merge_coverage,
            mode=self.config.cross_merge_mode,
        )
        return sorted_clusters, global_merged_flags

    def define_rigid_bodies(self):
        """
        Define all Rigid Bodies and Rigid Domains from clusters.

        Rigid Bodies contain one or more Rigid Domains.
        Rigid Domains are defined by tuples of (start_residue, end_residue, segment_id).

        This method uses self.clusters, self.input_file, self.first_residue, self.chain_segments,
        self.config.plddt_cutoff, self.config.min_segment_len, and self.global_merged_flags.
        It sets self.rigid_bodies and self.rigid_body_flags.
        """
        if not self.clusters:
            raise ValueError(
                "Clusters must be defined before defining rigid bodies. Call define_clusters() first."
            )

        rigid_bodies = []
        rigid_body_flags = []

        for i, cluster in enumerate(self.clusters):
            rigid_body = []
            if len(cluster) >= MIN_CLUSTER_LENGTH:
                sorted_cluster = self._sort_and_separate_cluster(
                    cluster, self.chain_segments
                )
                for region in sorted_cluster:
                    first_resnum_cluster = region[0]
                    last_resnum_cluster = region[-1]

                    # Calculate the average B-factor for the current region using the input handler
                    bfactor_avg = self.input_handler.calculate_bfactor_avg_for_region(
                        self.input_file,
                        first_resnum_cluster,
                        last_resnum_cluster,
                        self.first_residue,
                    )

                    # If the average B-factor is above the threshold, identify a new rigid domain
                    if bfactor_avg > self.config.plddt_cutoff:
                        new_rigid_domain = self.input_handler.identify_new_rigid_domain(
                            self.input_file,
                            first_resnum_cluster,
                            last_resnum_cluster,
                            self.first_residue,
                        )
                        if new_rigid_domain:
                            # Normalize orientation (start <= end)
                            s, e, seg, _ = new_rigid_domain
                            if s is not None and e is not None and s > e:
                                s, e = e, s
                            normalized = (s, e, seg, bfactor_avg)
                            # Deduplicate within this rigid body
                            if normalized not in rigid_body:
                                rigid_body.append(normalized)

            rigid_bodies.append(rigid_body)
            rigid_body_flags.append(
                self.global_merged_flags[i] if self.global_merged_flags else False
            )

        # Remove empty lists from our list of lists of tuples
        idxs = [i for i, rb in enumerate(rigid_bodies) if rb]
        all_non_empty_rigid_bodies = [rigid_bodies[i] for i in idxs]
        rigid_body_flags = [rigid_body_flags[i] for i in idxs]

        # print("Rigid Bodies:")
        # for i, rb in enumerate(all_non_empty_rigid_bodies, start=1):
        #     formatted_rb = [(s, e, seg, round(avg, 2)) for s, e, seg, avg in rb]
        #     print(f"  Rigid Body {i}: {formatted_rb}")

        # Ensure no Rigid Domains are adjacent; adjust to create a 2-residue gap
        updated = True
        while updated:
            updated, rigid_body_optimized = (
                self._find_and_update_sequential_rigid_domains(
                    all_non_empty_rigid_bodies, min_gap=2
                )
            )

        # Merge overlapping or duplicate residue ranges in each rigid body
        merged_rigid_bodies = []
        for rb in rigid_body_optimized:
            merged_rb = self._merge_overlapping_domains(rb)
            merged_rigid_bodies.append(merged_rb)
        # print("Optimized Rigid Bodies:")
        # for i, rb in enumerate(merged_rigid_bodies, start=1):
        #     formatted_rb = [(s, e, seg, round(avg, 2)) for s, e, seg, avg in rb]
        #     print(f"  Rigid Body {i}: {formatted_rb}")

        # Drop tiny segments and coalesce overlapping within same segid
        cleaned: list[list[tuple[int, int, str, float]]] = []
        cleaned_flags = []
        for rb, flag in zip(merged_rigid_bodies, rigid_body_flags):
            # Drop too-short segments
            rb2 = [
                (s, e, seg, avg)
                for (s, e, seg, avg) in rb
                if (e - s + 1) >= max(1, self.config.min_segment_len)
            ]
            # Coalesce overlapping within same segid (not merely adjacent)
            rb2.sort(key=lambda x: (x[2], x[0], x[1]))
            coalesced: list[tuple[int, int, str, float]] = []
            for s, e, seg, avg in rb2:
                if not coalesced or coalesced[-1][2] != seg or s > coalesced[-1][1]:
                    # start a new segment when there is any gap (including a 1-residue gap),
                    # only merge if segments actually overlap
                    coalesced.append((s, e, seg, avg))
                else:
                    ps, pe, pseg, pavg = coalesced[-1]
                    coalesced[-1] = (
                        min(ps, s),
                        max(pe, e),
                        pseg,
                        (pavg + avg) / 2,
                    )
            if coalesced:  # Only add if not empty after cleanup
                cleaned.append(coalesced)
                cleaned_flags.append(flag)
        # print("Cleaned Rigid Bodies:")
        # for i, rb in enumerate(cleaned, start=1):
        #     formatted_rb = [(s, e, seg, round(avg, 2)) for s, e, seg, avg in rb]
        #     print(f"  Rigid Body {i}: {formatted_rb}")

        # Final gap enforcement using the existing helper across ALL rigid bodies
        # (handles both intra-RB domains and adjacent domains across different RBs)
        updated = True
        rb_after_gap = cleaned
        while updated:
            updated, rb_after_gap = self._find_and_update_sequential_rigid_domains(
                rb_after_gap, min_gap=2
            )

        # After nudging edges, re-drop any segments that may have become too short
        final_rbs: list[list[tuple[int, int, str, float]]] = []
        final_flags: list[bool] = []
        for rb, flag in zip(rb_after_gap, cleaned_flags):
            rb2 = [
                (s, e, seg, avg)
                for (s, e, seg, avg) in rb
                if (e - s + 1) >= max(1, self.config.min_segment_len)
            ]
            if rb2:
                final_rbs.append(rb2)
                final_flags.append(flag)

        # print(
        #     "Rigid Bodies after enforcing min-gap with _find_and_update_sequential_rigid_domains:"
        # )
        # for i, rb in enumerate(final_rbs, start=1):
        #     formatted_rb = [(s, e, seg, round(avg, 2)) for s, e, seg, avg in rb]
        #     print(f"  Rigid Body {i}: {formatted_rb}")

        # Set instance attributes
        self.rigid_bodies = final_rbs
        self.rigid_body_flags = final_flags

    def print_rigid_stats(self):
        # Build full PAE numpy matrix
        if "predicted_aligned_error" in self.pae_data:
            pae_full = np.array(
                self.pae_data["predicted_aligned_error"], dtype=np.float32
            )
        elif "pae" in self.pae_data:
            pae_full = np.array(self.pae_data["pae"], dtype=np.float32)
        else:
            raise ValueError("PAE data must contain 'predicted_aligned_error' or 'pae'")
        mapper = self.input_handler.get_tuple_to_global_mapper(self.first_residue)
        for rb_idx, rb in enumerate(self.rigid_bodies, start=1):
            domain_meds = []
            domain_avgs = []
            print(f"[stats] RigidBody {rb_idx}: n_domains={len(rb)}")
            for s, e, seg, avg_plddt in rb:
                gs, ge = mapper((s, e, seg))
                # normalize orientation and clamp
                if gs is not None and ge is not None and gs > ge:
                    gs, ge = ge, gs
                med = _median_block(pae_full, gs, ge)
                mean = _mean_block(pae_full, gs, ge)
                domain_meds.append(med)
                domain_meds.append(mean)
                domain_avgs.append(avg_plddt)
                seg_str = seg if isinstance(seg, str) else str(seg)
                print(
                    f"  - {seg_str}:{int(s)}-{int(e)} (global {gs}-{ge}) len={int(e) - int(s) + 1} median={med:.2f} Å mean={mean:.2f} Å avg_pLDDT={avg_plddt:.2f}"
                )
            if domain_meds:
                # robust overall median across all domain pixels: median of medians is fine for printing
                overall_med = float(np.nanmedian(np.array(domain_meds, dtype=float)))
                overall_mean = float(np.nanmean(np.array(domain_meds, dtype=float)))
                overall_avg_plddt = float(
                    np.nanmean(np.array(domain_avgs, dtype=float))
                )
                print(
                    f"  > RigidBody {rb_idx} median-of-domains = {overall_med:.2f} Å mean-of-domains = {overall_mean:.2f} Å avg_pLDDT-of-domains = {overall_avg_plddt:.2f}"
                )

    def generate_visualization_artifacts(self):
        # 1) Build full PAE numpy matrix
        if "predicted_aligned_error" in self.pae_data:
            pae_full = np.array(
                self.pae_data["predicted_aligned_error"], dtype=np.float32
            )
        elif "pae" in self.pae_data:
            pae_full = np.array(self.pae_data["pae"], dtype=np.float32)
        else:
            raise ValueError("PAE data must contain 'predicted_aligned_error' or 'pae'")

        # 2) Determine L
        L = pae_full.shape[0]
        # 3) Downsample factor
        s = 2 if L > 1800 else 1
        pae_ds = stride_downsample(pae_full, s)

        # 4) Convert rigid_bodies_from_pae (list of lists of (start_residue, end_residue, segid)) into Cluster objects
        clusters = []
        tuple_to_global = self.input_handler.get_tuple_to_global_mapper(
            self.first_residue
        )

        for i, rb in enumerate(self.rigid_bodies):
            ranges = []
            for tup in rb:
                gstart, gend = tuple_to_global(tup[:3])
                if gstart is not None and gend is not None:
                    ranges.append((gstart, gend))
            if ranges:
                ctype = "fixed" if i == 0 else "rigid"
                clusters.append(
                    Cluster(
                        cid=i,
                        ctype=ctype,
                        ranges=ranges,
                        global_merge=self.rigid_body_flags[i],
                    )
                )

        # --- Compute chains spans (1-based inclusive) for viz.json
        chains = self.input_handler.get_chains(self.input_file, self.first_residue)

        save_viz_png(
            "viz.png",
            pae_ds,
            clusters,
            stride=s,
            chains=chains,
        )

        save_pae_bin("pae.bin", pae_ds)
        save_pae_png("pae.png", pae_ds)
        write_viz_json(
            "viz.json",
            length=L,
            clusters=clusters,
            plddt_cutoff=self.config.plddt_cutoff,
            low_conf=None,
            downsample=(s if s > 1 else None),
            chains=chains,
        )

    def write_run_config(self, output_path: str = "pae2const.conf", fmt: str = "yaml"):
        """
        Write a configuration/run-summary file capturing:
          - CLI/config values used
          - basic runtime context (input file, residue span, chain splits)
          - counts of clusters and rigid bodies that were produced
        The default format is YAML for readability; set fmt="json" to write JSON instead.
        """
        # Build a serializable payload
        try:
            cfg = asdict(self.config)
        except Exception:
            # Fallback: shallow dict via __dict__
            cfg = dict(self.config.__dict__)

        payload = {
            "input_file": self.input_file,
            "mode": "pdb" if isinstance(self.input_handler, PDBHandler) else "crd",
            "first_residue": int(self.first_residue)
            if self.first_residue is not None
            else None,
            "last_residue": int(self.last_residue)
            if self.last_residue is not None
            else None,
            "chain_segments": [int(x) for x in (self.chain_segments or [])],
            "config": cfg,
            "summary": {
                "num_clusters": int(
                    len(self.clusters) if self.clusters is not None else 0
                ),
                "num_rigid_bodies": int(
                    len(self.rigid_bodies) if self.rigid_bodies is not None else 0
                ),
            },
        }

        # Write the file
        if fmt.lower() in ("yaml", "yml"):
            with open(output_path, "w", encoding="utf-8") as fh:
                yaml.safe_dump(payload, fh, sort_keys=False, default_flow_style=False)
        else:
            with open(output_path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)

        print(f"[info] Wrote run configuration to {output_path} ({fmt.upper()})")

    @staticmethod
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

    @staticmethod
    def _build_edges_from_similarity(
        S: np.ndarray,
        pae: np.ndarray,
        pae_cutoff: float,
        k: int,
        min_seq_sep: int,
        chain_segs: list,
        interchain_cutoff: float,
        knn_mode: str = "union",
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
            # Precompute top-k neighbors per row
            topk = [None] * n
            for i in range(n):
                row = S_masked[i]
                if not np.any(row):
                    topk[i] = []
                    continue
                k_eff = min(k, n - 1)
                idx = np.argpartition(-row, kth=k_eff)[:k_eff]
                idx = [j for j in idx if row[j] > 0 and j != i]
                idx.sort(key=lambda j: row[j], reverse=True)
                topk[i] = idx

            edges_set: set[tuple[int, int]] = set()
            for i in range(n):
                for j in topk[i]:
                    if knn_mode == "mutual" and i not in topk[j]:
                        continue
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

    @staticmethod
    def _merge_clusters_by_affinity(
        pae: np.ndarray,
        clusters: list[list[int]],
        chain_segs: list,
        tau: float,
        cov: float,
        tau_cross: float,
        cov_cross: float,
        mode: str = "adjacent",
    ) -> tuple[list[list[int]], list[bool]]:
        """
        Merge clusters based on affinity.
        - Always starts with 'adjacent' mode to reduce cluster count efficiently.
        - If mode='any', follows with a greedy merge of any qualifying pairs on the reduced set.
        Returns (clusters, global_merged_flags) where global_merged_flags[i] is True if cluster i was created by a global merge.
        """

        def try_merge(a, b):
            ok = _should_merge(
                pae,
                a,  # pass full index set
                b,
                chain_segs,
                tau,
                cov,
                tau_cross,
                cov_cross,
            )
            if not ok:
                return None
            # Compute stats for scoring
            cross, med, coverage, thr, need = _offdiag_stats_sets(
                pae, a, b, chain_segs, tau, tau_cross, cov, cov_cross
            )
            merged = sorted(set(a) | set(b))
            return (merged, coverage, med)

        # Step 1: Always run 'adjacent' mode first to reduce cluster count
        spans = [(_cluster_span(c), i) for i, c in enumerate(clusters)]
        spans.sort(key=lambda t: t[0][0])
        clusters = [clusters[i] for _, i in spans]
        changed = True
        while changed and len(clusters) > 1:
            changed = False
            i = 0
            while i < len(clusters) - 1:
                a = clusters[i]
                b = clusters[i + 1]
                res = try_merge(a, b)
                if res is not None:
                    merged, _covscore, _med = res
                    clusters[i] = merged
                    del clusters[i + 1]
                    changed = True
                else:
                    i += 1

        # Initialize global merge flags: all False initially (none merged yet)
        global_merged_flags = [False] * len(clusters)

        # Step 2: If mode is 'any', run an additional greedy merge on the reduced set
        if mode == "any":
            # Greedy global merging to convergence
            changed = True
            while changed and len(clusters) > 1:
                changed = False
                best = None  # (score_cov, score_med, i, j, merged_list)
                n = len(clusters)
                for i in range(n):
                    ai = clusters[i]
                    spanA = _cluster_span(ai)
                    for j in range(i + 1, n):
                        bj = clusters[j]
                        spanB = _cluster_span(bj)
                        res = try_merge(ai, bj)
                        if res is None:
                            continue
                        merged, covscore, med = res
                        cand = (covscore, -med, i, j, merged, (spanA, spanB))
                        if best is None or cand > best:
                            best = cand
                if best is not None:
                    _covscore, _negmed, i, j, merged, (_sA, _sB) = best
                    # Rebuild cluster list with merged pair
                    new_clusters = []
                    global_merged_flags_new = []
                    for k, c in enumerate(clusters):
                        if k == i or k == j:
                            continue
                        new_clusters.append(c)
                        global_merged_flags_new.append(global_merged_flags[k])
                    new_clusters.append(merged)
                    # Mark the new merged cluster as globally merged
                    global_merged_flags_new.append(True)
                    clusters = new_clusters
                    global_merged_flags = global_merged_flags_new
                    changed = True

            # After greedy 'any' pass completes, compute non-merged off-diagonal stats **on the final cluster set only**
            nonmerge_stats = []
            n = len(clusters)
            for i in range(n):
                ai = clusters[i]
                spanA = _cluster_span(ai)
                for j in range(i + 1, n):
                    bj = clusters[j]
                    spanB = _cluster_span(bj)
                    # Decide with true sets
                    ok = _should_merge(
                        pae, ai, bj, chain_segs, tau, cov, tau_cross, cov_cross
                    )
                    if ok:
                        continue  # would merge; skip
                    # Gather stats for reporting
                    cross, med, coverage, thr, need = _offdiag_stats_sets(
                        pae, ai, bj, chain_segs, tau, tau_cross, cov, cov_cross
                    )
                    block = pae[np.ix_(ai, bj)]
                    mean_val = float(np.mean(block)) if block.size > 0 else float("nan")
                    nonmerge_stats.append(
                        {
                            "mean": mean_val,
                            "median": med,
                            "coverage": coverage,
                            "cross": cross,
                            "thr": thr,
                            "need": need,
                            "spanA": spanA,
                            "spanB": spanB,
                        }
                    )

            if nonmerge_stats:
                nonmerge_stats.sort(
                    key=lambda d: (float("inf") if np.isnan(d["mean"]) else d["mean"]),
                    reverse=True,
                )
                print(
                    f"[merge-debug] Non-merged off-diagonal blocks {len(nonmerge_stats)} (sorted by meanPAE ascending):"
                )
                for d in nonmerge_stats:
                    a0, a1 = d["spanA"]
                    b0, b1 = d["spanB"]
                    mean_val = d["mean"]
                    med = d["median"]
                    covv = d["coverage"]
                    cross = d["cross"]
                    thr = d["thr"]
                    need = d["need"]
                    cross_flag = "cross" if cross else "same"
                    print(
                        f"  ({a0}-{a1}) vs ({b0}-{b1}) [{cross_flag}] "
                        f"meanPAE={mean_val:.2f} Å, median={med:.2f} Å, coverage={covv:.2f} "
                        f"(τ={thr:.2f}, req_cov={need:.2f})"
                    )

        return clusters, global_merged_flags

    def write_outputs(self, input_file: str):
        """Write output files: const.inp and optionally constraints.yaml."""
        if not self.config.no_const:
            self._write_const_file(self.rigid_bodies, "const.inp", input_file)
        if self.config.emit_constraints:
            self._write_constraints_yaml(
                self.rigid_bodies, self.config.emit_constraints
            )

    @staticmethod
    def _write_constraints_yaml(rigid_body_list: list, output_path: str):
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
                for (start, stop, segid, _) in rb
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

        data = {
            "constraints": {"fixed_bodies": fixed_bodies, "rigid_bodies": rigid_bodies}
        }
        with open(output_path, "w", encoding="utf-8") as fh:
            yaml.safe_dump(data, fh, sort_keys=False)

    @staticmethod
    def _write_const_file(
        rigid_body_list: list, output_file: str, input_file: str = None
    ):
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
                    start_residue = int(rigid_domain[0])
                    end_residue = int(rigid_domain[1])
                    segment = rigid_domain[2]
                    if start_residue > end_residue:
                        start_residue, end_residue = end_residue, start_residue
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

    @staticmethod
    def _sort_and_separate_cluster(numbers, chain_segs: list):
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
        >>> PAEProcessor._sort_and_separate_cluster([1, 2, 3, 7, 8, 9, 11], [3, 8])
        [[1, 2], [3], [7], [8, 9], [11]]
        """
        numbers = sorted(numbers)
        regions = []
        current_region = [numbers[0]]
        for i in range(1, len(numbers)):
            if (numbers[i] == numbers[i - 1] + 1) and (
                numbers[i - 1] not in chain_segs
            ):
                current_region.append(numbers[i])
            else:
                regions.append(current_region)
                current_region = [numbers[i]]

        regions.append(current_region)
        return regions

    @staticmethod
    def _find_and_update_sequential_rigid_domains(lists_of_tuples, min_gap: int = 2):
        """
        Identify and adjust sequential rigid domains on the same chain so there is at least `min_gap`
        residues **between** them (i.e., start2 - end1 - 1 >= min_gap).

        For each pair on the same chain where the gap is too small, we "nudge" the boundaries outward.
        We do this symmetrically where possible:
        - Let gap = start2 - end1 - 1.
        - If gap >= min_gap: OK.
        - Else, need = min_gap - gap.
            * Move end1 left by ceil(need/2)
            * Move start2 right by floor(need/2)
        If one side would invert its segment (start > end), we clamp that side and push the remaining
        needed adjustment to the other side.

        Returns:
        (updated: bool, updated_lists: list[list[tuple[int,int,str,float]]])
        """
        if min_gap < 0:
            min_gap = 0

        # Collect proposed updates
        updated = False
        updates = {}  # key=(s,e,seg,avg) -> (new_s,new_e,avg)

        # Group all domains by segid for simpler ordered comparisons
        by_seg: dict[str, list[tuple[int, int, str, float]]] = {}
        for outer in lists_of_tuples:
            for s, e, seg, avg in outer:
                by_seg.setdefault(seg, []).append((s, e, seg, avg))

        for seg, domains in by_seg.items():
            # Sort by start then end (normalized)
            domains_sorted = sorted(
                domains, key=lambda d: (min(d[0], d[1]), max(d[0], d[1]))
            )

            for i in range(len(domains_sorted) - 1):
                s1, e1, _seg1, a1 = domains_sorted[i]
                s2, e2, _seg2, a2 = domains_sorted[i + 1]

                # normalize orientation
                if s1 > e1:
                    s1, e1 = e1, s1
                if s2 > e2:
                    s2, e2 = e2, s2

                # current gap in residues between the two domains
                gap = s2 - e1 - 1
                if gap >= min_gap:
                    continue

                need = min_gap - gap  # how many residues to create
                left_push = (need + 1) // 2  # ceil(need/2)
                right_push = need // 2  # floor(need/2)

                new_e1 = e1 - left_push
                new_s2 = s2 + right_push

                # If left collapses, transfer deficit to right
                if new_e1 < s1:
                    deficit = s1 - new_e1
                    new_e1 = s1
                    new_s2 += deficit

                # If right collapses, transfer deficit to left
                if new_s2 > e2:
                    deficit = new_s2 - e2
                    new_s2 = e2
                    new_e1 -= deficit
                    if new_e1 < s1:
                        new_e1 = s1  # clamp; cleanup later may drop too-short segments

                if new_e1 != e1 or new_s2 != s2:
                    updates[(domains_sorted[i][0], domains_sorted[i][1], seg, a1)] = (
                        s1,
                        new_e1,
                        a1,
                    )
                    updates[
                        (domains_sorted[i + 1][0], domains_sorted[i + 1][1], seg, a2)
                    ] = (new_s2, e2, a2)
                    updated = True

        # Apply updates
        for i, outer in enumerate(lists_of_tuples):
            for j, (s, e, seg, avg) in enumerate(outer):
                key = (s, e, seg, avg)
                if key in updates:
                    ns, ne, na = updates[key]
                    lists_of_tuples[i][j] = (ns, ne, seg, na)

        return updated, lists_of_tuples

    @staticmethod
    def _merge_overlapping_domains(
        domains: list[tuple[int, int, str, float]],
    ) -> list[tuple[int, int, str, float]]:
        """
        Merge overlapping or contiguous residue ranges with the same segid,
        and deduplicate exact duplicates.
        Input: list of (start, end, segid, avg_plddt)
        Output: merged list
        """
        # Deduplicate exact duplicates
        unique_domains = list(set(domains))
        # Sort by segid, then start
        unique_domains.sort(key=lambda x: (x[2], x[0], x[1]))
        merged = []
        for d in unique_domains:
            s, e, seg, avg = d
            if s > e:
                s, e = e, s
            if not merged or seg != merged[-1][2]:
                merged.append((s, e, seg, avg))
            else:
                last_s, last_e, last_seg, last_avg = merged[-1]
                # If overlapping or contiguous, merge
                if s <= last_e + 1:
                    merged[-1] = (
                        min(last_s, s),
                        max(last_e, e),
                        seg,
                        (last_avg + avg) / 2,
                    )
                else:
                    merged.append((s, e, seg, avg))
        return merged


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


def _chain_id_for_index(idx: int, chain_segs: list) -> int:
    if not chain_segs:
        return 0
    c = 0
    for b in chain_segs:
        if idx > b:
            c += 1
        else:
            break
    return c


def _cluster_span(cluster: list[int]) -> tuple[int, int]:
    return (min(cluster), max(cluster))


def _majority_chain_id(indices: list[int], chain_segs: list) -> int:
    """Return the majority chain id for a set of 0-based indices, based on chain_segs."""
    if not chain_segs or not indices:
        return 0
    counts = defaultdict(int)
    for idx in indices:
        cid = _chain_id_for_index(idx, chain_segs)
        counts[cid] += 1
    # return the chain id with max count
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _offdiag_stats_sets(
    pae: np.ndarray,
    a_idx: list[int],
    b_idx: list[int],
    chain_segs: list,
    tau: float,
    tau_cross: float,
    cov: float,
    cov_cross: float,
) -> tuple[bool, float, float, float, float]:
    """
    Compute median and coverage for the true off-diagonal block between the two
    *sets* of indices (a_idx x b_idx), not their rectangular spans.
    Returns (cross, median, coverage, thr, need).
    """
    if not a_idx or not b_idx:
        return (False, float("inf"), 0.0, tau, cov)
    arr = pae[np.ix_(a_idx, b_idx)]
    if arr.size == 0:
        return (False, float("inf"), 0.0, tau, cov)
    # majority-chain heuristic for threshold selection
    a_cid = _majority_chain_id(a_idx, chain_segs)
    b_cid = _majority_chain_id(b_idx, chain_segs)
    cross = a_cid != b_cid
    thr = tau_cross if cross else tau
    need = cov_cross if cross else cov
    med = float(np.median(arr))
    coverage = float(np.mean(arr <= thr))
    return (cross, med, coverage, thr, need)


def _is_span(x) -> bool:
    """Return True if x looks like a (start, end) 2-tuple/list/array of ints."""
    if isinstance(x, (list, tuple, np.ndarray)) and len(x) == 2:
        a, b = x[0], x[1]
        return isinstance(a, (int, np.integer)) and isinstance(b, (int, np.integer))
    return False


def _should_merge(
    pae: np.ndarray,
    a_span_or_set,
    b_span_or_set,
    chain_segs,
    tau,
    cov,
    tau_cross,
    cov_cross,
) -> bool:
    """
    Decide merge using *true* cluster membership when possible.
    - If inputs are not 2-length spans, treat them as sets of indices and evaluate on np.ix_(a,b).
    - If inputs are 2-length spans, fall back to rectangular span evaluation.
    """
    # Prefer set-based evaluation unless both are explicit 2-length spans.
    if not _is_span(a_span_or_set) or not _is_span(b_span_or_set):
        a_idx = list(a_span_or_set)
        b_idx = list(b_span_or_set)
        if len(a_idx) == 0 or len(b_idx) == 0:
            return False
        cross, med, coverage, thr, need = _offdiag_stats_sets(
            pae, a_idx, b_idx, chain_segs, tau, tau_cross, cov, cov_cross
        )
        return (med <= thr) and (coverage >= need)

    # Fall back: rectangular spans
    ai, aj = a_span_or_set
    bi, bj = b_span_or_set
    block = pae[ai : aj + 1, bi : bj + 1]
    if block.size == 0:
        return False
    cross = _chain_id_for_index(ai, chain_segs) != _chain_id_for_index(bi, chain_segs)
    thr = tau_cross if cross else tau
    need = cov_cross if cross else cov
    med = float(np.median(block))
    coverage = float(np.mean(block <= thr))
    return (med <= thr) and (coverage >= need)


def _median_block(pae: np.ndarray, gstart: int, gend: int) -> float:
    """Median PAE within the diagonal block [gstart,gend] (1-based inclusive)."""
    if gstart is None or gend is None:
        return float("nan")
    a0 = int(gstart) - 1
    a1 = int(gend)
    if a0 < 0 or a1 <= a0 or a1 > pae.shape[0]:
        return float("nan")
    block = pae[a0:a1, a0:a1]
    if block.size == 0:
        return float("nan")
    return float(np.median(block))


def _mean_block(pae: np.ndarray, gstart: int, gend: int) -> float:
    """Mean PAE within the diagonal block [gstart,gend] (1-based inclusive)."""
    if gstart is None or gend is None:
        return float("nan")
    a0 = int(gstart) - 1
    a1 = int(gend)
    if a0 < 0 or a1 <= a0 or a1 > pae.shape[0]:
        return float("nan")
    block = pae[a0:a1, a0:a1]
    if block.size == 0:
        return float("nan")
    return float(np.mean(block))


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
        default=10.0,
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
        default=0,
        help="k for k-NN sparsification (per node). 0 disables and uses threshold graph",
    )
    parser.add_argument(
        "--knn_mode",
        type=str,
        choices=["union", "mutual"],
        default="union",
        help="k-NN mode: 'union' (default) or 'mutual' (edge only if i is in j's top-k AND j in i's top-k)",
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
        default=4,
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
        default=0.35,
        help="Leiden resolution parameter γ (default 0.35)",
    )
    parser.add_argument(
        "--leiden_iters",
        type=int,
        default=10,
        help="Leiden iterations (default 10)",
    )
    parser.add_argument(
        "--merge_tau",
        type=float,
        default=7.0,
        help="Post-merge: τ (Å) threshold for median off-diagonal PAE between adjacent clusters",
    )
    parser.add_argument(
        "--merge_coverage",
        type=float,
        default=0.6,
        help="Post-merge: required fraction of pairs ≤ τ within the off-diagonal block (0..1)",
    )
    parser.add_argument(
        "--cross_merge_tau",
        type=float,
        default=15.0,
        help="Post-merge: stricter τ (Å) for cross-chain merges",
    )
    parser.add_argument(
        "--cross_merge_coverage",
        type=float,
        default=0.6,
        help="Post-merge: coverage for cross-chain merges (0..1)",
    )
    parser.add_argument(
        "--min_segment_len",
        type=int,
        default=10,
        help="Minimum segment length; shorter segments are dropped in cleanup",
    )
    parser.add_argument(
        "--cross_merge_mode",
        type=str,
        choices=["adjacent", "any"],
        default="any",
        help="Post-merge mode: 'adjacent' merges only neighbors, "
        "'any' (default) allows merging of any pair that meets thresholds.",
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

    config = PAEConfig(
        plddt_cutoff=args.plddt_cutoff,
        graph_sim=args.graph_sim,
        sigma=args.sigma,
        linear_T=args.linear_T,
        knn=args.knn,
        knn_mode=args.knn_mode,
        pae_cutoff=args.pae_cutoff,
        min_seq_sep=args.min_seq_sep,
        interchain_cutoff=args.interchain_cutoff,
        leiden_resolution=args.leiden_resolution,
        leiden_iters=args.leiden_iters,
        merge_tau=args.merge_tau,
        merge_coverage=args.merge_coverage,
        cross_merge_tau=args.cross_merge_tau,
        cross_merge_coverage=args.cross_merge_coverage,
        cross_merge_mode=args.cross_merge_mode,
        min_segment_len=args.min_segment_len,
        emit_constraints=args.emit_constraints,
        no_const=args.no_const,
    )

    # Instantiate processor first
    processor = PAEProcessor(config=config)

    # Determine handler based on input type and set processor attributes
    if args.pdb_file:
        processor.input_handler = PDBHandler()
        processor.input_file = args.pdb_file
    elif args.crd_file:
        processor.input_handler = CRDHandler()
        processor.input_file = args.crd_file

    # Load PAE data and set up processor state
    processor.load_pae_data(args.pae_file)
    processor.first_residue, processor.last_residue = (
        processor.get_first_and_last_residue_numbers(processor.input_file)
    )
    processor.chain_segments = processor.define_segments(processor.input_file)

    # Adjust chain segments for CRD mode (if needed)
    if args.crd_file and processor.first_residue is not None:
        offset = processor.first_residue - 1
        processor.chain_segments = [
            max(0, idx - offset) for idx in processor.chain_segments
        ]

    # Validate that input structure and PAE matrix align before proceeding
    processor.validate_alignment()

    # Define clusters and rigid bodies using processor methods
    processor.define_clusters()
    processor.define_rigid_bodies()

    # Generate outputs
    processor.print_rigid_stats()
    processor.generate_visualization_artifacts()
    # Write a readable run configuration snapshot alongside the artifacts
    processor.write_run_config("pae2const.yaml", fmt="yaml")
    processor.write_outputs(processor.input_file)
