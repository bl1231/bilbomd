"""
Read a FoXS / MultiFoXS fit file and score how well the model fits the data.

A fit file has four columns: q, experimental intensity, model intensity, error.
Lines starting with '#' or ';' are comments.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import numpy as np

# q-regions (Å⁻¹) used to localise a misfit. Low q reports on overall size and
# mass, mid q on shape and domain arrangement, and high q is weak signal that
# is sensitive to buffer subtraction.
Q_REGIONS: Tuple[Tuple[str, float, float], ...] = (
    ("low", 0.0, 0.1),
    ("mid", 0.1, 0.2),
    ("high", 0.2, float("inf")),
)

# A region with fewer points than this is not scored: its chi-square would be
# dominated by a handful of points.
REGION_MIN_POINTS = 5


@dataclass(frozen=True)
class FitProfile:
    """Experimental and model intensities on a shared q grid, sorted by q."""

    q: np.ndarray
    i_exp: np.ndarray
    i_model: np.ndarray
    err: np.ndarray

    @property
    def residuals(self) -> np.ndarray:
        """Error-normalised residuals (I_exp - I_model) / sigma."""
        return (self.i_exp - self.i_model) / self.err


@dataclass(frozen=True)
class RegionStats:
    name: str
    q_min: float
    q_max: float
    n_points: int
    chi_square: float
    mean_residual: float


def load_fit_file(path) -> FitProfile:
    """Load a four-column fit file, dropping unusable points and sorting by q."""
    data = np.loadtxt(path, comments=("#", ";"), ndmin=2)
    if data.shape[0] == 0 or data.shape[1] < 4:
        raise ValueError(
            f"{path}: expected 4 columns (q, exp_intensity, model_intensity, error)"
        )
    q, i_exp, i_model, err = data[:, 0], data[:, 1], data[:, 2], data[:, 3]

    usable = (
        np.isfinite(q)
        & np.isfinite(i_exp)
        & np.isfinite(i_model)
        & np.isfinite(err)
        & (err > 0)
        & (q >= 0)
    )
    if not np.any(usable):
        raise ValueError(f"{path}: no usable points (need finite values and error > 0)")

    order = np.argsort(q[usable], kind="stable")
    return FitProfile(
        q=q[usable][order],
        i_exp=i_exp[usable][order],
        i_model=i_model[usable][order],
        err=err[usable][order],
    )


def chi_square(profile: FitProfile, mask: Optional[np.ndarray] = None) -> float:
    """Chi-square per point, as FoXS reports it: mean of squared residuals."""
    residuals = profile.residuals if mask is None else profile.residuals[mask]
    if residuals.size == 0:
        raise ValueError("chi-square needs at least one point")
    return float(np.mean(residuals**2))


def region_stats(
    profile: FitProfile,
    regions: Sequence[Tuple[str, float, float]] = Q_REGIONS,
    min_points: int = REGION_MIN_POINTS,
) -> List[RegionStats]:
    """
    Chi-square and mean residual in each q-region the data actually cover.

    Each point belongs to exactly one region (lower bound inclusive, upper
    bound exclusive). Regions with fewer than `min_points` points are left out,
    so data ending below 0.2 Å⁻¹ simply have no high-q region.
    """
    stats: List[RegionStats] = []
    for name, lower, upper in regions:
        mask = (profile.q >= lower) & (profile.q < upper)
        n_points = int(np.count_nonzero(mask))
        if n_points < min_points:
            continue
        q_in_region = profile.q[mask]
        stats.append(
            RegionStats(
                name=name,
                q_min=float(q_in_region[0]),
                q_max=float(q_in_region[-1]),
                n_points=n_points,
                chi_square=chi_square(profile, mask),
                mean_residual=float(np.mean(profile.residuals[mask])),
            )
        )
    return stats
