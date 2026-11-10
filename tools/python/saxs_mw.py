"""
Molecular weight from a SAXS curve by the volume-of-correlation method.

Rambo & Tainer, Nature 2013, 496:477:

    Vc = I(0) / integral of q * I(q) dq
    Qr = Vc^2 / Rg
    MW = (Qr / c)^k        protein: c = 0.1231, k = 1
                           RNA:     c = 0.00934, k = 0.808

Vc is independent of concentration and of the intensity scale, so no
calibration is needed. The paper reports errors under about 10 % for
well-behaved samples; flexible or elongated particles and noisy data do worse.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

from guinier import guinier_scan

METHOD = "vc_rambo_tainer"

# (c, k) in MW = (Qr / c)^k, MW in Da
VC_CONSTANTS = {
    "protein": (0.1231, 1.0),
    "rna": (0.00934, 0.808),
}

# Upper limit of the Vc integral, Å⁻¹. The published constants were derived
# with data truncated near here; beyond it the integral is noise-dominated.
VC_QMAX = 0.3

# Data that stop well short of VC_QMAX truncate the integral and inflate MW.
VC_QMAX_SHORT = 0.25

# Guinier fit settings, the same as autorg.py uses, so the Rg behind the MW is
# the Rg shown elsewhere in BilboMD.
GUINIER_MIN_POINTS = 10
GUINIER_QRG_MIN = 0.30
GUINIER_QRG_MAX = 1.30
GUINIER_R2_FLOOR = 0.90


@dataclass(frozen=True)
class MwEstimate:
    """A SAXS MW estimate, or the reason one could not be made."""

    mw_kda: Optional[float] = None
    particle: str = "protein"
    rg: Optional[float] = None
    i0: Optional[float] = None
    guinier_r2: Optional[float] = None
    guinier_qmin: Optional[float] = None
    guinier_qmax: Optional[float] = None
    vc: Optional[float] = None
    qmax_used: Optional[float] = None
    short_q_range: bool = False
    reason: Optional[str] = None

    @property
    def assessed(self) -> bool:
        return self.mw_kda is not None


def _trapezoid(y: np.ndarray, x: np.ndarray) -> float:
    integrate = getattr(np, "trapezoid", None) or np.trapz
    return float(integrate(y, x))


def correlation_volume(
    q: np.ndarray, intensity: np.ndarray, i0: float, rg: float, qmax: float = VC_QMAX
) -> float:
    """
    Vc = I(0) / integral from 0 to qmax of q * I(q) dq.

    The unmeasured part below the first data point is filled in with the
    Guinier approximation I(q) = I(0) * exp(-(q * Rg)^2 / 3), which integrates
    in closed form.
    """
    in_range = q <= qmax
    q, intensity = q[in_range], intensity[in_range]
    if q.size < 2:
        raise ValueError("Too few points below qmax for the Vc integral.")

    a = rg * rg / 3.0
    below_first_point = i0 * (1.0 - np.exp(-a * q[0] ** 2)) / (2.0 * a)
    area = below_first_point + _trapezoid(q * intensity, q)
    if area <= 0:
        raise ValueError("Non-positive integral in the Vc calculation.")
    return float(i0 / area)


def estimate_mw_vc(
    q,
    intensity,
    sigma,
    *,
    particle: str = "protein",
    qmax: float = VC_QMAX,
) -> MwEstimate:
    """
    Estimate MW (kDa) from an experimental profile. Never raises for bad data:
    returns an MwEstimate with `reason` set instead.
    """
    if particle not in VC_CONSTANTS:
        raise ValueError(f"Unknown particle type: {particle}")

    q = np.asarray(q, dtype=float)
    intensity = np.asarray(intensity, dtype=float)
    sigma = np.asarray(sigma, dtype=float)
    finite = np.isfinite(q) & np.isfinite(intensity) & np.isfinite(sigma) & (sigma > 0)
    q, intensity, sigma = q[finite], intensity[finite], sigma[finite]

    # The Guinier fit works on log(I), so it only sees positive intensities.
    positive = intensity > 0
    try:
        fit = guinier_scan(
            q[positive],
            intensity[positive],
            sigma[positive],
            min_points=GUINIER_MIN_POINTS,
            qrg_min=GUINIER_QRG_MIN,
            qrg_max=GUINIER_QRG_MAX,
            r2_floor=GUINIER_R2_FLOOR,
        )
    except ValueError as error:
        return MwEstimate(particle=particle, reason=str(error))

    rg, i0, r2 = float(fit["Rg"]), float(fit["I0"]), float(fit["r2"])
    # guinier_scan reports r2 = 0 when no window passed its quality checks.
    if not (rg > 0 and i0 > 0 and r2 > 0):
        return MwEstimate(
            particle=particle,
            reason="No acceptable Guinier region was found in the data.",
        )

    try:
        vc = correlation_volume(q, intensity, i0, rg, qmax)
    except ValueError as error:
        return MwEstimate(particle=particle, rg=rg, i0=i0, reason=str(error))

    c, k = VC_CONSTANTS[particle]
    qmax_used = float(min(qmax, q[-1]))
    return MwEstimate(
        mw_kda=float(((vc * vc / rg) / c) ** k / 1000.0),
        particle=particle,
        rg=rg,
        i0=i0,
        guinier_r2=r2,
        guinier_qmin=float(fit["qmin"]),
        guinier_qmax=float(fit["qmax"]),
        vc=vc,
        qmax_used=qmax_used,
        short_q_range=qmax_used < VC_QMAX_SHORT,
    )
