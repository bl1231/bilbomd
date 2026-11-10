"""Superpose ensemble members on the rigid domain they share (bilbomd#1200).

BioEmu2 writes every structure in an arbitrary orientation, so the members of a MultiFoXS
ensemble do not line up the way MD frames do. A fit over all residues does not help for a
flexible system: it spreads the difference everywhere. Instead:

1. For every residue pair, take the standard deviation of the distance over all sampled
   structures. A pair whose distance barely varies moves as one rigid body.
2. Cluster that matrix into rigid domains (Leiden, then merge clusters that do not move
   relative to each other).
3. Superpose every member on the largest domain (the anchor) of the reference member.

If no rigid domain is found (a mostly disordered system, or too few samples), all residues
are used instead and the report says so. A rigid-body move does not change a scattering
curve, so the SAXS fit is unaffected.

The report also carries the distance-spread matrix (binned to at most 512 x 512, one byte
per cell) and each residue's domain, so the job page can show how the domains were found.

Usage: align_ensemble.py <request.json> <report.json>

request.json:
  {"samples_dir": "<job>/foxs",              sampled structures, read recursively
   "members": [{"in": "...pdb", "out": "...pdb"}, ...],
   "reference": "<the 'in' path of one member>",
   "sd_cutoff": 1.5}                          optional, Å

Needs numpy and python-igraph (the worker's base environment).
"""

from __future__ import annotations

import base64
import json
import random
import sys
from pathlib import Path

import igraph
import numpy as np

# One atom per residue: Cα for protein, C4' for nucleic acids
TRACE_ATOMS = {"CA", "C4'"}
SD_CUTOFF = 1.5  # Å: a pair is rigid if its distance varies less than this
MIN_SEQ_SEP = 4  # neighbours in sequence are always close; they say nothing about rigidity
MIN_CLUSTER = 5  # Leiden clusters smaller than this are not merged, only attached
MIN_DOMAIN = 20  # residues: smaller bodies are not reported as domains
MIN_SAMPLES = 10  # fewer structures than this cannot tell rigid from flexible
LEIDEN_RESOLUTION = 0.5
MATRIX_MAX_SIZE = 512  # cells per side of the matrix in the report
MATRIX_MAX_SD = 20.0  # Å: spreads at or above this share the top byte value

ResidueId = tuple[str, int, str]  # chain, residue number, insertion code


def read_trace(path: Path) -> dict[ResidueId, np.ndarray]:
    """The trace atom of every residue in the first model of a PDB file."""
    trace: dict[ResidueId, np.ndarray] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("ENDMDL"):
                break
            if line.startswith(("ATOM", "HETATM")) and line[12:16].strip() in TRACE_ATOMS:
                rid = (line[21], int(line[22:26]), line[26])
                if rid not in trace:
                    trace[rid] = np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])])
    return trace


def distance_sd(coords: np.ndarray) -> np.ndarray:
    """Standard deviation of every pair distance over the structures. coords: (S, N, 3)."""
    n = coords.shape[1]
    total = np.zeros((n, n))
    total_sq = np.zeros((n, n))
    for x in coords:
        d = np.linalg.norm(x[:, None] - x[None], axis=-1)
        total += d
        total_sq += d * d
    mean = total / len(coords)
    return np.sqrt(np.maximum(total_sq / len(coords) - mean**2, 0.0))


def find_domains(sd: np.ndarray, cutoff: float = SD_CUTOFF) -> list[np.ndarray]:
    """Rigid domains as arrays of residue indices, largest first."""
    n = sd.shape[0]
    idx = np.arange(n)
    i, j = np.where((sd < cutoff) & (np.abs(idx[:, None] - idx[None]) >= MIN_SEQ_SEP))
    upper = i < j
    if not upper.any():
        return []
    graph = igraph.Graph(n=n, edges=list(zip(i[upper].tolist(), j[upper].tolist())))
    graph.es["weight"] = (1.0 - sd[i[upper], j[upper]] / cutoff).tolist()
    random.seed(0)  # Leiden is stochastic; igraph draws from Python's random
    membership = np.array(
        graph.community_leiden(
            weights="weight", resolution=LEIDEN_RESOLUTION, n_iterations=10, objective_function="CPM"
        ).membership
    )
    groups = [np.where(membership == k)[0] for k in np.unique(membership)]
    groups = [g for g in groups if len(g) >= MIN_CLUSTER]

    # Leiden over-splits a rigid body: merge clusters that do not move relative to each other
    while len(groups) > 1:
        best: tuple[float, int, int] | None = None
        for a in range(len(groups)):
            for b in range(a + 1, len(groups)):
                spread = float(np.median(sd[np.ix_(groups[a], groups[b])]))
                if spread < cutoff and (best is None or spread < best[0]):
                    best = (spread, a, b)
        if best is None:
            break
        _, a, b = best
        groups[a] = np.sort(np.concatenate([groups[a], groups[b]]))
        del groups[b]
    if not groups:
        return []

    # Attach loose residues to the body they are rigid with
    for r in np.setdiff1d(idx, np.concatenate(groups)):
        spreads = [float(np.median(sd[r, g])) for g in groups]
        k = int(np.argmin(spreads))
        if spreads[k] < cutoff:
            groups[k] = np.sort(np.append(groups[k], r))
    return sorted((g for g in groups if len(g) >= MIN_DOMAIN), key=len, reverse=True)


def kabsch(mobile: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Rotation R and translation t so that mobile @ R + t best fits target."""
    mc, tc = mobile.mean(0), target.mean(0)
    u, _, vt = np.linalg.svd((mobile - mc).T @ (target - tc))
    rot = u @ np.diag([1.0, 1.0, np.sign(np.linalg.det(u @ vt))]) @ vt
    return rot, tc - mc @ rot


def rmsd(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(((a - b) ** 2).sum(-1).mean()))


def residue_ranges(residues: list[ResidueId]) -> list[str]:
    """['A:2-13', 'A:22-90', 'B:19-37'] for a list of residue ids."""
    out: list[str] = []
    by_chain: dict[str, list[int]] = {}
    for chain, number, _ in residues:
        by_chain.setdefault(chain, []).append(number)
    for chain, numbers in by_chain.items():
        numbers = sorted(set(numbers))
        start = prev = numbers[0]
        for number in numbers[1:]:
            if number != prev + 1:
                out.append(f"{chain}:{start}-{prev}")
                start = number
            prev = number
        out.append(f"{chain}:{start}-{prev}")
    return out


def encode_matrix(sd: np.ndarray) -> dict:
    """The spread matrix for the report: block-averaged to at most MATRIX_MAX_SIZE cells a
    side, scaled to one byte per cell (0 = rigid, 255 = MATRIX_MAX_SD or more), base64."""
    n = sd.shape[0]
    bin_size = -(-n // MATRIX_MAX_SIZE)  # ceil
    size = -(-n // bin_size)
    padded = np.full((size * bin_size, size * bin_size), np.nan)
    padded[:n, :n] = sd
    binned = np.nanmean(padded.reshape(size, bin_size, size, bin_size), axis=(1, 3))
    scaled = np.clip(np.round(binned / MATRIX_MAX_SD * 255), 0, 255).astype(np.uint8)
    return {
        "size": int(size),
        "bin": int(bin_size),
        "max_sd": MATRIX_MAX_SD,
        "data": base64.b64encode(scaled.tobytes()).decode("ascii"),
    }


def transform_pdb(src: Path, dst: Path, rot: np.ndarray, shift: np.ndarray) -> None:
    """Copy a PDB file with its atom coordinates rotated and shifted."""
    lines = []
    with open(src, encoding="utf-8") as f:
        for line in f:
            if line.startswith(("ATOM", "HETATM")):
                xyz = np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])]) @ rot + shift
                line = f"{line[:30]}{xyz[0]:8.3f}{xyz[1]:8.3f}{xyz[2]:8.3f}{line[54:]}"
            lines.append(line)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text("".join(lines), encoding="utf-8")


def load_samples(samples_dir: Path, residues: list[ResidueId]) -> np.ndarray:
    """Trace coordinates (S, N, 3) of the sampled structures that have every residue."""
    coords = []
    for path in sorted(samples_dir.rglob("*.pdb")):
        trace = read_trace(path)
        if all(r in trace for r in residues):
            coords.append(np.stack([trace[r] for r in residues]))
    return np.array(coords)


def align(request: dict) -> dict:
    members = request["members"]
    cutoff = float(request.get("sd_cutoff", SD_CUTOFF))
    traces = {m["in"]: read_trace(Path(m["in"])) for m in members}
    reference = request.get("reference") if request.get("reference") in traces else members[0]["in"]

    # Residues every member has, in the reference's order
    residues = [r for r in traces[reference] if all(r in t for t in traces.values())]
    if len(residues) < 3:
        raise ValueError("the ensemble members share fewer than 3 residues to superpose on")

    samples = load_samples(Path(request["samples_dir"]), residues)
    domains: list[np.ndarray] = []
    sd: np.ndarray | None = None
    if len(samples) >= MIN_SAMPLES:
        sd = distance_sd(samples)
        domains = find_domains(sd, cutoff)

    method = "rigid-domain" if domains else "all-residues"
    anchor = domains[0] if domains else np.arange(len(residues))
    assigned = np.concatenate(domains) if domains else np.array([], dtype=int)
    flexible = np.setdiff1d(np.arange(len(residues)), assigned)
    labels = np.zeros(len(residues), dtype=int)  # 0 = flexible, k = domain k
    for k, d in enumerate(domains, start=1):
        labels[d] = k

    def coords(member: str) -> np.ndarray:
        return np.stack([traces[member][r] for r in residues])

    # The reference keeps its orientation; its anchor is moved to the origin
    target = coords(reference)
    target = target - target[anchor].mean(0)
    report_members = []
    for m in members:
        x = coords(m["in"])
        rot, shift = kabsch(x[anchor], target[anchor])
        transform_pdb(Path(m["in"]), Path(m["out"]), rot, shift)
        moved = x @ rot + shift
        report_members.append(
            {
                "in": m["in"],
                "out": m["out"],
                "anchor_rmsd": round(rmsd(moved[anchor], target[anchor]), 3),
                "overall_rmsd": round(rmsd(moved, target), 3),
            }
        )

    return {
        "method": method,
        "sd_cutoff": cutoff,
        "samples": int(len(samples)),
        "residues": len(residues),
        "reference": reference,
        "anchor_size": int(len(anchor)),
        "domains": [
            {"id": k + 1, "size": int(len(d)), "residues": residue_ranges([residues[i] for i in d])}
            for k, d in enumerate(domains)
        ],
        "flexible": residue_ranges([residues[i] for i in flexible]) if len(flexible) and domains else [],
        "members": report_members,
        # One entry per residue, in matrix order
        "residue_chains": [r[0] for r in residues],
        "residue_numbers": [r[1] for r in residues],
        "residue_domains": labels.tolist(),
        "matrix": encode_matrix(sd) if sd is not None else None,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    request = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    report = align(request)
    Path(argv[2]).write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(
        f"{report['method']}: {len(report['domains'])} rigid domains from {report['samples']} samples, "
        f"anchor {report['anchor_size']} of {report['residues']} residues, "
        f"{len(report['members'])} members superposed"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
