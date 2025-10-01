# helper functions for visualization of PAE matrices and clusters
from dataclasses import dataclass
from typing import List, Tuple, Literal, Dict, Any
import json
import numpy as np

ClusterType = Literal["rigid", "fixed"]


@dataclass
class Cluster:
    cid: int
    ctype: ClusterType
    ranges: List[Tuple[int, int]]  # 1-based inclusive

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
) -> None:
    payload: Dict[str, Any] = {
        "length": length,
        "clusters": [
            {
                "id": c.cid,
                "type": c.ctype,
                "ranges": [[a, b] for (a, b) in c.ranges],
                "bbox": list(c.bbox()),
            }
            for c in clusters
        ],
    }
    if plddt_cutoff is not None or low_conf:
        payload["mask"] = {
            "plddt_cutoff": plddt_cutoff,
            "low_confidence_residues": low_conf or [],
        }
    if downsample and downsample > 1:
        payload["downsample"] = downsample

    with open(out_path, "w") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)


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
    # im = ax.imshow(mat, vmin=0.0, vmax=31.0, cmap="viridis", origin="upper")
    fig.savefig(out_path, dpi=256)
    plt.close(fig)


def save_viz_png(out_path: str, mat: np.ndarray, clusters: List[Cluster]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches

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
            patches.Rectangle(
                (x, y), w, h, linewidth=0.6, edgecolor=edge, facecolor=face
            )
        )

    fig.savefig(out_path, dpi=256)
    plt.close(fig)
