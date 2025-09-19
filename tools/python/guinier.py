# tools/python/guinier.py
from __future__ import annotations
from typing import Dict
from typing import NamedTuple
import numpy as np


class GuinierCandidate(NamedTuple):
    Rg: float
    I0: float
    qmin: float
    qmax: float
    i: int
    j: int
    r2: float
    qrg_min: float
    qrg_max: float


def guinier_scan(
    q,
    intensity,
    sigma=None,
    *,
    min_points=10,
    qrg_min=0.30,
    qrg_max=1.30,
    r2_floor=0.95,
) -> Dict[str, float]:
    """
    Fast Guinier scan using prefix sums (O(1) per window).
    Returns dict: Rg, I0, qmin, qmax, i, j, r2, qrg_min, qrg_max.
    """
    q = np.asarray(q, dtype=float)
    intensity = np.asarray(intensity, dtype=float)
    n = q.size
    if n < min_points:
        raise ValueError(f"Not enough points for Guinier fit (need >= {min_points}).")

    x = q * q
    y = np.log(intensity)
    if sigma is not None:
        w = 1.0 / (np.asarray(sigma, dtype=float) ** 2)
    else:
        w = np.ones_like(y)

    W = np.concatenate(([0.0], np.cumsum(w)))
    WX = np.concatenate(([0.0], np.cumsum(w * x)))
    WY = np.concatenate(([0.0], np.cumsum(w * y)))
    WXX = np.concatenate(([0.0], np.cumsum(w * x * x)))
    WXY = np.concatenate(([0.0], np.cumsum(w * x * y)))
    WYY = np.concatenate(([0.0], np.cumsum(w * y * y)))

    def sums(i, j):
        return (
            W[j + 1] - W[i],
            WX[j + 1] - WX[i],
            WY[j + 1] - WY[i],
            WXX[j + 1] - WXX[i],
            WXY[j + 1] - WXY[i],
            WYY[j + 1] - WYY[i],
        )

    best = None
    for i in range(0, n - min_points + 1):
        for j in range(i + min_points - 1, n):
            wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
            denom = wsum * wxx - wx * wx
            if denom <= 0:
                continue
            m = (wsum * wxy - wx * wy) / denom
            if m >= 0:
                continue
            b = (wy - m * wx) / wsum

            sse = (
                wyy
                - 2.0 * m * wxy
                - 2.0 * b * wy
                + m * m * wxx
                + 2.0 * m * b * wx
                + b * b * wsum
            )
            ybar = wy / wsum
            sst = wyy - wsum * ybar * ybar
            if sst <= 0:
                continue
            r2 = 1.0 - (sse / sst)
            if r2 < r2_floor:
                continue

            rg = float(np.sqrt(-3.0 * m))
            qrg_lo = float(q[i] * rg)
            qrg_hi = float(q[j] * rg)
            if not (qrg_min <= qrg_lo <= qrg_max and qrg_min <= qrg_hi <= qrg_max):
                continue

            cand = GuinierCandidate(
                Rg=rg,
                I0=float(np.exp(b)),
                qmin=float(q[i]),
                qmax=float(q[j]),
                i=i,
                j=j,
                r2=float(r2),
                qrg_min=qrg_lo,
                qrg_max=qrg_hi,
            )
            if (
                best is None
                or cand.r2 > best.r2
                or (
                    np.isclose(cand.r2, best.r2)
                    and ((cand.j - cand.i) > (best.j - best.i) or cand.qmin < best.qmin)
                )
            ):
                best = cand

    if best is None:
        i, j = 0, min_points - 1
        wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
        denom = wsum * wxx - wx * wx
        if denom <= 0:
            return {
                "Rg": 0.0,
                "I0": 0.0,
                "qmin": float(q[i]),
                "qmax": float(q[j]),
                "i": i,
                "j": j,
                "r2": 0.0,
                "qrg_min": 0.0,
                "qrg_max": 0.0,
            }
        m = (wsum * wxy - wx * wy) / denom
        b = (wy - m * wx) / wsum
        rg = float(np.sqrt(max(0.0, -3.0 * m)))
        return {
            "Rg": rg,
            "I0": float(np.exp(b)),
            "qmin": float(q[i]),
            "qmax": float(q[j]),
            "i": i,
            "j": j,
            "r2": 0.0,
            "qrg_min": float(q[i] * rg),
            "qrg_max": float(q[j] * rg),
        }

    return {
        "Rg": best.Rg,
        "I0": best.I0,
        "qmin": best.qmin,
        "qmax": best.qmax,
        "i": best.i,
        "j": best.j,
        "r2": best.r2,
        "qrg_min": best.qrg_min,
        "qrg_max": best.qrg_max,
    }
