# tools/python/saxs_utils.py
from __future__ import annotations
from typing import Optional, Tuple
import numpy as np


def load_profile(path: str) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    """
    Load a 2- or 3-column SAXS curve: q, I(q), [sigma].
    - Filters invalid/negative values.
    - Sorts by q ascending.
    - Returns (q, I, sigma) where sigma may be None.
    """
    data = np.loadtxt(path, comments=("#", ";"))
    if data.ndim == 1:
        # Ensure a single-row 2D array if only one row was read
        data = data[np.newaxis, :]
    if data.shape[1] < 2:
        raise ValueError("Input must have at least two columns: q and I(q)")

    q = data[:, 0]
    I = data[:, 1]
    sigma = data[:, 2] if data.shape[1] >= 3 else None

    mask = np.isfinite(q) & np.isfinite(I) & (I > 0) & (q >= 0)
    if sigma is not None:
        mask &= np.isfinite(sigma) & (sigma > 0)
    if not np.any(mask):
        raise ValueError("No valid q/I(q) points after filtering.")

    q = q[mask]
    I = I[mask]
    if sigma is not None:
        sigma = sigma[mask]

    order = np.argsort(q)
    q = q[order]
    I = I[order]
    if sigma is not None:
        sigma = sigma[order]

    return q, I, sigma
