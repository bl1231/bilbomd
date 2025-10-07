# tools/python/saxs_utils.py
from __future__ import annotations

from typing import Optional, Tuple

import numpy as np


def load_profile(path: str) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    """
    Load a 2- or 3-column SAXS curve: q, I(q), [sigma].
    - Filters invalid/negative values.
    - Sorts by q ascending.
    - Handles extra header/footer lines by parsing only lines with at least 2 numeric values.
    - Returns (q, I, sigma) where sigma may be None.
    """
    with open(path, "r") as f:
        lines = f.readlines()

    data_lines = []
    for line in lines:
        parts = line.strip().split()
        if len(parts) >= 2:
            try:
                floats = [
                    float(p) for p in parts[:3]
                ]  # Attempt to parse up to 3 floats
                if len(floats) >= 2:
                    data_lines.append(floats)
            except ValueError:
                continue  # Skip lines that aren't numeric

    if not data_lines:
        raise ValueError(
            "No valid q/I(q) data lines found after filtering headers/footers."
        )

    data = np.array(data_lines)
    if data.shape[1] < 2:
        raise ValueError("Input must have at least two columns: q and I(q)")

    q = data[:, 0]
    intensity = data[:, 1]
    sigma = data[:, 2] if data.shape[1] >= 3 else None

    mask = np.isfinite(q) & np.isfinite(intensity) & (intensity > 0) & (q >= 0)
    if sigma is not None:
        mask &= np.isfinite(sigma) & (sigma > 0)
    if not np.any(mask):
        raise ValueError("No valid q/I(q) points after filtering.")

    q = q[mask]
    intensity = intensity[mask]
    if sigma is not None:
        sigma = sigma[mask]

    order = np.argsort(q)
    q = q[order]
    intensity = intensity[order]
    if sigma is not None:
        sigma = sigma[order]

    return q, intensity, sigma
