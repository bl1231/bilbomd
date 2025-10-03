# helper functions for visualization of PAE matrices and clusters
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Tuple

import numpy as np

ClusterType = Literal["rigid", "fixed"]


@dataclass
class Cluster:
    cid: int
    ctype: ClusterType
    ranges: List[Tuple[int, int]]  # 1-based inclusive
    global_merge: bool = False

    def bbox(self) -> Tuple[int, int, int, int]:
        # diagonal square bbox covering all ranges
        i_min = min(a for a, _ in self.ranges)
        i_max = max(b for _, b in self.ranges)
        return (i_min, i_min, i_max, i_max)


def stride_downsample(mat: np.ndarray, s: int) -> np.ndarray:
    """Naive stride downsample; good enough for visualization."""
    if s <= 1:
        return mat
    # trim to multiple of s to avoid shape remainders
    n = mat.shape[0] - (mat.shape[0] % s)
    m = mat.shape[1] - (mat.shape[1] % s)
    return mat[:n:s, :m:s]


def write_viz_json(
    out_path: str,
    length: int,
    clusters: List[Cluster],
    plddt_cutoff: int | None = None,
    low_conf: List[int] | None = None,
    downsample: int | None = None,
    chains: List[Dict[str, Any]] | None = None,
) -> None:
    cluster_list = []
    for i, c in enumerate(clusters):
        global_merge = c.global_merge
        cluster_list.append(
            {
                "id": c.cid,
                "type": c.ctype,
                "ranges": [[a, b] for (a, b) in c.ranges],
                "bbox": list(c.bbox()),
                "global_merge": global_merge,  # New field in JSON
            }
        )
    payload: Dict[str, Any] = {
        "length": length,
        "clusters": cluster_list,
    }

    if plddt_cutoff is not None or low_conf:
        payload["mask"] = {
            "plddt_cutoff": plddt_cutoff,
            "low_confidence_residues": low_conf or [],
        }

    if downsample and downsample > 1:
        payload["downsample"] = downsample

    if chains:
        payload["chains"] = chains

    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, separators=(",", ":"), ensure_ascii=False)


def save_pae_bin(out_path: str, mat: np.ndarray) -> None:
    mat.astype(np.float32).tofile(out_path)


def save_pae_png(out_path: str, mat: np.ndarray) -> None:
    # Simple matplotlib image; deterministic without seaborn
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig = plt.figure(figsize=(4, 4), dpi=256)  # sharp
    ax = plt.axes([0, 0, 1, 1])
    ax.axis("off")
    ax.imshow(mat, vmin=0.0, vmax=31.0, cmap="viridis", origin="upper")
    fig.savefig(out_path, dpi=256)
    plt.close(fig)


def save_viz_png(
    out_path: str,
    mat: np.ndarray,
    clusters: List[Cluster],
    offdiag_rects: List[Tuple[int, int, int, int]] | None = None,
    stride: int = 1,
    chains: List[Dict[str, Any]] | None = None,
) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.patches as patches
    import matplotlib.pyplot as plt

    L = mat.shape[0]
    print(f"Saving viz PNG {out_path} with {len(clusters)} clusters for {L}x{L} matrix")
    fig = plt.figure(figsize=(4, 4), dpi=256)
    ax = plt.axes([0, 0, 1, 1])
    ax.axis("off")
    ax.imshow(mat, vmin=0.0, vmax=31.0, cmap="viridis", origin="upper")

    def rect_from_bbox(b):
        i1, j1, i2, j2 = b  # 1-based
        # imshow coords are 0..L along both axes; expand to cell edges
        x = j1 - 1
        y = i1 - 1
        w = j2 - j1 + 1
        h = i2 - i1 + 1
        return x, y, w, h

    for c in clusters:
        x, y, w, h = rect_from_bbox(c.bbox())
        face = (1, 0, 0, 0.12) if c.ctype == "rigid" else (0, 0.45, 1, 0.10)
        edge = (0, 0, 0, 1)
        ax.add_patch(
            patches.Rectangle((x, y), w, h, linewidth=2, edgecolor=edge, facecolor=face)
        )
        # If the cluster is composed of multiple discontiguous ranges, add per-range mini boxes
        if len(c.ranges) > 1:
            for ra, rb in c.ranges:
                rx, ry, rw, rh = rect_from_bbox((ra, ra, rb, rb))
                ax.add_patch(
                    patches.Rectangle(
                        (rx, ry),
                        rw,
                        rh,
                        linewidth=1,
                        edgecolor=(1, 0, 1),  # magenta
                        facecolor="none",
                    )
                )

    # Optional: draw off-diagonal debug rectangles (row_start,row_end,col_start,col_end), 1-based inclusive
    if offdiag_rects:
        for r_start, r_end, c_start, c_end in offdiag_rects:
            if r_start is None or r_end is None or c_start is None or c_end is None:
                continue
            # convert 1-based inclusive -> 0-based half-open
            a0 = max(0, int(r_start) - 1)
            a1 = max(0, int(r_end))
            b0 = max(0, int(c_start) - 1)
            b1 = max(0, int(c_end))

            s = max(1, stride)
            # map to downsampled pixels; ceil-div for end to include last pixel
            x0 = b0 // s
            y0 = a0 // s
            x1 = (b1 + s - 1) // s
            y1 = (a1 + s - 1) // s

            # clamp to image bounds
            x0 = max(0, min(x0, L - 1))
            y0 = max(0, min(y0, L - 1))
            x1 = max(0, min(x1, L))
            y1 = max(0, min(y1, L))

            ax.add_patch(
                patches.Rectangle(
                    (x0, y0),
                    x1 - x0,
                    y1 - y0,
                    linewidth=1,
                    edgecolor=(1, 0, 1),
                    facecolor="none",
                )
            )

    # Draw chain borders as dashed lines
    if chains:
        for chain in chains[:-1]:  # Skip the last chain as it has no border after it
            border_pos = chain["end"]
            # Vertical line at the end of the chain
            ax.axvline(x=border_pos, linestyle="--", color="black", linewidth=0.7)
            # Horizontal line at the end of the chain
            ax.axhline(y=border_pos, linestyle="--", color="black", linewidth=0.7)

    fig.savefig(out_path, dpi=256)
    plt.close(fig)
