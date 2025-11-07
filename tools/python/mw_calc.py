"""
Inputs: 3-column dat file (q, I(q), Error), q in Å⁻¹
Outputs: JSON file
"""

import argparse
import json
import numpy as np
from typing import Optional, Dict

# ------------------------- Simple Guinier fitting -------------------------

def guinier_scan(q: np.ndarray, intensity: np.ndarray, sigma: Optional[np.ndarray] = None,
                 *, min_points: int = 10, qrg_min: float = 0.3, qrg_max: float = 1.3,
                 r2_floor: float = 0.95) -> Dict[str, float]:
    """Fast Guinier region scan. Returns Rg, I0, qmin, qmax, r2."""
    q = np.asarray(q, dtype=float)
    intensity = np.asarray(intensity, dtype=float)
    intensity[intensity <= 0] = 1e-10  # avoid log(0)
    n = q.size
    if n < min_points:
        raise ValueError(f"Not enough points for Guinier fit (need >= {min_points}).")

    x = q**2
    y = np.log(intensity)
    w = 1.0 / (np.asarray(sigma, dtype=float)**2) if sigma is not None else np.ones_like(y)

    W = np.concatenate(([0.0], np.cumsum(w)))
    WX = np.concatenate(([0.0], np.cumsum(w*x)))
    WY = np.concatenate(([0.0], np.cumsum(w*y)))
    WXX = np.concatenate(([0.0], np.cumsum(w*x*x)))
    WXY = np.concatenate(([0.0], np.cumsum(w*x*y)))
    WYY = np.concatenate(([0.0], np.cumsum(w*y*y)))

    def sums(i: int, j: int):
        return (W[j+1]-W[i], WX[j+1]-WX[i], WY[j+1]-WY[i],
                WXX[j+1]-WXX[i], WXY[j+1]-WXY[i], WYY[j+1]-WYY[i])

    best = None
    for i in range(0, n - min_points + 1):
        for j in range(i + min_points - 1, n):
            wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
            denom = wsum*wxx - wx*wx
            if denom <= 0.0:
                continue
            m = (wsum*wxy - wx*wy)/denom
            if m >= 0.0:
                continue
            b = (wy - m*wx)/wsum

            sse = wyy - 2*m*wxy - 2*b*wy + m*m*wxx + 2*m*b*wx + b*b*wsum
            ybar = wy/wsum
            sst = wyy - wsum*ybar*ybar
            if sst <= 0: continue
            r2 = 1 - sse/sst
            if r2 < r2_floor: continue

            rg = float(np.sqrt(-3.0*m))
            qrg_lo = float(q[i]*rg)
            qrg_hi = float(q[j]*rg)
            if not (qrg_min <= qrg_lo <= qrg_max and qrg_min <= qrg_hi <= qrg_max):
                continue

            cand = (rg, np.exp(b), q[i], q[j], r2)
            if best is None or cand[4] > best[4]:
                best = cand

    if best is None:
        raise RuntimeError("No suitable Guinier region found.")
    return {"Rg": best[0], "I0": best[1], "qmin": best[2], "qmax": best[3], "r2": best[4]}


# ------------------------- Volume of correlation -------------------------

def volume_of_correlation(q: np.ndarray, I: np.ndarray, I0: float, Rg: float, qmin: float, qmax: float = 0.25) -> Dict[str, float]:
    """
    Compute Vc and mmvc:
    - From q=0→qmin: use Guinier extrapolation I(q)=I0*exp(-(q*Rg)^2/3) evaluated on 100 points
    - From qmin→qmax: use actual data (interpolated if needed)
    - Integrate q*I(q)dq from 0→0.25
    - Compute Vc = I0 / ∫ q I(q) dq
    - Compute mmvc = (Vc^2 / (Rg*c))^k with c=0.1231, k=1
    """
    # --- region 1: guinier extrapolation (0→qmin) ---
    q_low = np.linspace(0, qmin, 100)
    I_low = I0 * np.exp(-(q_low * Rg)**2 / 3.0)

    # --- region 2: experimental (qmin→qmax) ---
    mask = (q >= qmin) & (q <= qmax)
    q_exp = q[mask]
    I_exp = I[mask]

    # --- combine both regions ---
    q_all = np.concatenate([q_low, q_exp])
    I_all = np.concatenate([I_low, I_exp])

    # --- integrate q * I(q) dq ---
    integral = np.trapezoid(q_all * I_all, q_all)
    Vc = I0 / integral

    c = 0.1231
    k = 1
    mmvc = (Vc**2 / (Rg * c))**k

    return {"vc": Vc, "mmvc": mmvc}

# ------------------------- File I/O -------------------------

def load_profile(path: str):
    arr = np.loadtxt(path)
    if arr.shape[1] == 2:
        q, I = arr[:,0], arr[:,1]
        sigma = None
    else:
        q, I, sigma = arr[:,0], arr[:,1], arr[:,2]
    return q, I, sigma


# ------------------------- Main -------------------------

def main():
    parser = argparse.ArgumentParser(description="Guinier + vc for SAXS curve.")
    parser.add_argument("data_path", help="Path to SAXS data file (q I [σ]).")
    parser.add_argument("--out", required=True, help="Output JSON path.")
    args = parser.parse_args()

    q, I, sigma = load_profile(args.data_path)

    result = guinier_scan(q, I, sigma)
    I0 = result["I0"]
    Rg = result["Rg"]
    qmin = result["qmin"]

    # vc + mmvc
    vc_res = volume_of_correlation(q, I, I0, Rg, qmin)
    result.update(vc_res)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(
        f"Saved Rg={Rg:.2f}, I0={I0:.4g}"
        f"Vc={vc_res['vc']:.4g}, mmvc={vc_res['mmvc']:.4g} to {args.out}"
    )


if __name__ == "__main__":
    main()
