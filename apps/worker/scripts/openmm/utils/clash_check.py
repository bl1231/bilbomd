"""Inter-atomic clash detection for OpenMM input structures."""

import numpy as np
from openmm.unit import nanometer
from utils.logger import get_logger

logger = get_logger("clash_check")

# Physically impossible for non-bonded atoms — exit immediately
HARD_THRESHOLD_NM = 0.05  # 0.5 Å
# Very severe clash — warn, but allow minimization to attempt recovery
SOFT_THRESHOLD_NM = 0.15  # 1.5 Å
# Cap for O(N²) pairwise check; sample uniformly for larger systems
_SAMPLE_SIZE = 1500


def check_clashes(modeller) -> tuple[int, int, list[str]]:
    """Check for inter-residue atom clashes in the modeller positions.

    Samples up to _SAMPLE_SIZE heavy atoms and computes pairwise distances.
    Returns (hard_count, soft_count, examples) where:
      - hard_count: pairs closer than HARD_THRESHOLD_NM (0.5 Å) — catastrophic
      - soft_count: pairs between HARD and SOFT threshold (0.5–1.5 Å) — severe
      - examples: up to 5 human-readable descriptions of the worst clashes
    """
    atoms = list(modeller.topology.atoms())
    positions = modeller.positions

    heavy = [
        (i, a)
        for i, a in enumerate(atoms)
        if a.element is not None and a.element.symbol != "H"
    ]
    if len(heavy) < 2:
        return 0, 0, []

    sampled = heavy
    if len(heavy) > _SAMPLE_SIZE:
        step = len(heavy) // _SAMPLE_SIZE
        sampled = heavy[::step]
        logger.info(f"Clash check: sampling {len(sampled)} of {len(heavy)} heavy atoms.")

    indices = [i for i, _ in sampled]
    atom_objs = [a for _, a in sampled]

    coords = np.array(
        [list(positions[i].value_in_unit(nanometer)) for i in indices],
        dtype=float,
    )
    res_indices = np.array([a.residue.index for a in atom_objs])

    # Pairwise squared distances — upper triangle, inter-residue pairs only
    diff = coords[:, None, :] - coords[None, :, :]  # (N, N, 3)
    dist2 = np.sum(diff ** 2, axis=2)               # (N, N)

    n = len(coords)
    triu = np.triu(np.ones((n, n), dtype=bool), k=1)
    diff_res = res_indices[:, None] != res_indices[None, :]

    hard_mask = (dist2 < HARD_THRESHOLD_NM ** 2) & triu & diff_res
    soft_mask = (dist2 < SOFT_THRESHOLD_NM ** 2) & (dist2 >= HARD_THRESHOLD_NM ** 2) & triu & diff_res

    hard_count = int(np.sum(hard_mask))
    soft_count = int(np.sum(soft_mask))

    examples: list[str] = []
    for idx_i, idx_j in np.argwhere(hard_mask)[:5]:
        ai, aj = atom_objs[idx_i], atom_objs[idx_j]
        d_ang = float(np.sqrt(dist2[idx_i, idx_j])) * 10  # nm → Å
        examples.append(
            f"{ai.residue.name}{ai.residue.id}.{ai.name} — "
            f"{aj.residue.name}{aj.residue.id}.{aj.name} "
            f"({d_ang:.2f} Å)"
        )

    return hard_count, soft_count, examples
