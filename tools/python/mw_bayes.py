"""
Bayesian-ish molecular weight estimator for SAXS.

Features:
- Computes Guinier I(0) & Rg (sigma-weighted if available)
- Computes correlation volume Vc (scale-robust feature)
- Computes Porod volume Vp (approximate, needs decent high-q)
- Supports calibration on standards (JSON) to learn a log-linear model:
    log(MW) ~ a0 + a1*log(I0/c) + a2*log(Vc) + a3*log(Vp)
- If no calibration provided, can use a single-feature power-law: MW = alpha * Vc^beta

Usage examples:
    python mw_bayes.py sample.dat --out mw.json --use-vc --alpha 0.048 --beta 1.00
    python mw_bayes.py sample.dat --out mw.json --calibration standards.json --use-i0 --use-vc --use-vp --conc 5.0

"""

from __future__ import annotations
import json
import argparse
import numpy as np
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
from saxs_utils import load_profile

# ------------------------- Shared Guinier fitter -------------------------
# Prefer a shared fast implementation from tools/python/guinier.py; if it
# doesn't exist yet, fall back to a local implementation here so the script
# remains self-contained and fast.
try:
    from guinier import guinier_scan  # type: ignore
except Exception:

    def guinier_scan(
        q: np.ndarray,
        intensity: np.ndarray,
        sigma: Optional[np.ndarray] = None,
        *,
        min_points: int = 10,
        qrg_min: float = 0.30,
        qrg_max: float = 1.30,
        r2_floor: float = 0.95,
    ) -> Dict[str, float]:
        """
        Fast Guinier scan using prefix sums (O(1) per window).
        Returns a dict with keys: Rg, I0, qmin, qmax, i, j, r2, qrg_min, qrg_max.
        """
        q = np.asarray(q, dtype=float)
        intensity = np.asarray(intensity, dtype=float)
        n = q.size
        if n < min_points:
            raise ValueError(
                f"Not enough points for Guinier fit (need >= {min_points})."
            )

        x = q * q
        y = np.log(intensity)
        if sigma is not None:
            w = 1.0 / (np.asarray(sigma, dtype=float) ** 2)
        else:
            w = np.ones_like(y)

        # Prefix sums
        W = np.concatenate(([0.0], np.cumsum(w)))
        WX = np.concatenate(([0.0], np.cumsum(w * x)))
        WY = np.concatenate(([0.0], np.cumsum(w * y)))
        WXX = np.concatenate(([0.0], np.cumsum(w * x * x)))
        WXY = np.concatenate(([0.0], np.cumsum(w * x * y)))
        WYY = np.concatenate(([0.0], np.cumsum(w * y * y)))

        def sums(i: int, j: int):
            return (
                W[j + 1] - W[i],
                WX[j + 1] - WX[i],
                WY[j + 1] - WY[i],
                WXX[j + 1] - WXX[i],
                WXY[j + 1] - WXY[i],
                WYY[j + 1] - WYY[i],
            )

        best = None  # (rg, I0, qmin, qmax, i, j, r2, qrg_min, qrg_max)

        for i in range(0, n - min_points + 1):
            for j in range(i + min_points - 1, n):
                wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
                denom = wsum * wxx - wx * wx
                if denom <= 0.0:
                    continue
                m = (wsum * wxy - wx * wy) / denom
                if m >= 0.0:
                    continue
                b = (wy - m * wx) / wsum

                # Weighted R^2
                # SSE = sum w(y - (mx+b))^2; SST = sum w(y - ybar)^2
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
                if sst <= 0.0:
                    continue
                r2 = 1.0 - (sse / sst)
                if r2 < r2_floor:
                    continue

                rg = float(np.sqrt(-3.0 * m))
                qrg_lo = float(q[i] * rg)
                qrg_hi = float(q[j] * rg)
                if not (qrg_min <= qrg_lo <= qrg_max and qrg_min <= qrg_hi <= qrg_max):
                    continue

                cand = (
                    rg,
                    float(np.exp(b)),
                    float(q[i]),
                    float(q[j]),
                    i,
                    j,
                    float(r2),
                    qrg_lo,
                    qrg_hi,
                )
                if (
                    best is None
                    or cand[6] > best[6]
                    or (
                        np.isclose(cand[6], best[6])
                        and (
                            (cand[5] - cand[4]) > (best[5] - best[4])
                            or (cand[2] < best[2])
                        )
                    )
                ):
                    best = cand

        if best is None:
            # Fallback to the first window
            i, j = 0, min_points - 1
            wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
            denom = wsum * wxx - wx * wx
            if denom <= 0.0:
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
            "Rg": best[0],
            "I0": best[1],
            "qmin": best[2],
            "qmax": best[3],
            "i": best[4],
            "j": best[5],
            "r2": best[6],
            "qrg_min": best[7],
            "qrg_max": best[8],
        }


# ------------------------- Vc and Vp -------------------------


def correlation_volume(
    q: np.ndarray, intensity: np.ndarray, I0: float, qmax: Optional[float] = None
) -> float:
    """Compute correlation volume Vc ~ I(0) / ∫ q I(q) dq (scale-robust feature).
    Units depend on input; used comparatively or via calibration.
    """
    if qmax is not None:
        m = q <= qmax
        q, intensity = q[m], intensity[m]
    integrand = q * intensity
    area = np.trapz(integrand, q)
    if area <= 0:
        raise ValueError("Non-positive integral in Vc calculation.")
    return float(I0 / area)


def porod_volume(
    q: np.ndarray, intensity: np.ndarray, I0: float, qmax: Optional[float] = None
) -> float:
    """Approximate Porod volume Vp via Porod invariant: Vp ~ 2*pi^2 * I(0) / Q,
    where Q = ∫ q^2 I(q) dq (finite-range approximation). Shape- and range-dependent.
    """
    if qmax is not None:
        m = q <= qmax
        q, intensity = q[m], intensity[m]
    Q = np.trapz((q**2) * intensity, q)
    if Q <= 0:
        raise ValueError("Non-positive Porod integral.")
    Vp = (2.0 * np.pi**2) * I0 / Q
    return float(Vp)


# ------------------------- Calibration model -------------------------


def _fit_log_linear(X: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, float]:
    """Fit y = B @ [1, X...] + eps in least squares (log-space). Returns (B, sigma_resid)."""
    A = np.hstack([np.ones((X.shape[0], 1)), X])
    B, *_ = np.linalg.lstsq(A, y, rcond=None)
    yhat = A @ B
    resid = y - yhat
    sigma = float(np.sqrt(np.sum(resid**2) / max(1, (len(y) - len(B)))))
    return B, sigma


def _predict_log_linear(B: np.ndarray, X: np.ndarray) -> np.ndarray:
    A = np.hstack([np.ones((X.shape[0], 1)), X])
    return A @ B


# ------------------------- Main estimation -------------------------


@dataclass
class EstimationConfig:
    use_i0: bool = False
    use_vc: bool = True
    use_vp: bool = False
    qmax: Optional[float] = None
    conc: Optional[float] = None  # g/cm^3 (e.g., mg/mL -> divide by 1000)
    alpha: Optional[float] = None  # fallback MW = alpha * Vc^beta
    beta: Optional[float] = None


def estimate_mw(
    sample_path: str,
    out_path: str,
    cfg: EstimationConfig,
    calibration_json: Optional[str] = None,
) -> Dict[str, Any]:
    q, intensity, sigma = load_profile(sample_path)
    g = guinier_scan(
        q, intensity, sigma, min_points=10, qrg_min=0.30, qrg_max=1.30, r2_floor=0.95
    )
    I0, Rg = g["I0"], g["Rg"]

    feats: Dict[str, float] = {"Rg": Rg, "I0": I0}
    if cfg.use_vc:
        feats["Vc"] = correlation_volume(q, intensity, I0, cfg.qmax)
    if cfg.use_vp:
        feats["Vp"] = porod_volume(q, intensity, I0, cfg.qmax)
    if cfg.use_i0:
        if cfg.conc is None:
            raise ValueError("--use-i0 requires --conc (g/cm^3)")
        feats["I0_over_c"] = I0 / cfg.conc

    result: Dict[str, Any] = {
        "Rg": Rg,
        "I0": I0,
        "features": feats,
        "model": None,
        "mw_kDa": None,
        "mw_ci68_kDa": None,
    }

    # If calibration provided, fit log-linear model on available features
    if calibration_json is not None:
        with open(calibration_json, "r", encoding="utf-8") as f:
            standards = json.load(f)
        rows = []
        y = []
        for s in standards:
            spath = s["data_path"]
            mw_kDa = float(s["MW_kDa"])
            q_s, I_s, sig_s = load_profile(spath)
            g_s = guinier_scan(
                q_s,
                I_s,
                sig_s,
                min_points=10,
                qrg_min=0.30,
                qrg_max=1.30,
                r2_floor=0.95,
            )
            I0_s = g_s["I0"]
            feats_s = {}
            if cfg.use_vc:
                feats_s["Vc"] = correlation_volume(q_s, I_s, I0_s, cfg.qmax)
            if cfg.use_vp:
                feats_s["Vp"] = porod_volume(q_s, I_s, I0_s, cfg.qmax)
            if cfg.use_i0:
                conc_s = (
                    float(s.get("conc_g_per_cm3"))
                    if s.get("conc_g_per_cm3") is not None
                    else None
                )
                if conc_s is None:
                    # Skip this standard if I0/c is requested but concentration missing
                    continue
                feats_s["I0_over_c"] = I0_s / conc_s
            # Build feature vector in a consistent order
            vec = []
            keys = []
            for k in ("I0_over_c", "Vc", "Vp"):
                if k in feats_s:
                    vec.append(np.log(feats_s[k]))
                    keys.append(k)
            if not vec:
                continue
            rows.append(vec)
            y.append(np.log(mw_kDa))
        if not rows:
            raise ValueError("No usable standards for the chosen feature set.")
        X = np.array(rows)
        yv = np.array(y)
        B, sigma = _fit_log_linear(X, yv)
        # Predict for sample using the same feature order
        sample_vec = []
        for k in ("I0_over_c", "Vc", "Vp"):
            if k in feats:
                sample_vec.append(np.log(feats[k]))
        sample_vec = np.array(sample_vec).reshape(1, -1)
        log_mw_hat = _predict_log_linear(B, sample_vec)[0]
        mw_hat = float(np.exp(log_mw_hat))
        # 68% CI from residual sigma in log-space
        ci68 = (float(np.exp(log_mw_hat - sigma)), float(np.exp(log_mw_hat + sigma)))
        result.update(
            {
                "model": {
                    "type": "log_linear",
                    "coefficients": B.tolist(),
                    "resid_sigma_log": sigma,
                    "features_used": [
                        k for k in ("I0_over_c", "Vc", "Vp") if k in feats
                    ],
                },
                "mw_kDa": mw_hat,
                "mw_ci68_kDa": ci68,
            }
        )
    else:
        # No calibration: fall back to Vc-only power-law, if provided
        if cfg.use_vc and cfg.alpha is not None and cfg.beta is not None:
            mw_hat = float(cfg.alpha * (feats["Vc"] ** cfg.beta))
            result.update(
                {
                    "model": {
                        "type": "power_law",
                        "alpha": cfg.alpha,
                        "beta": cfg.beta,
                        "feature": "Vc",
                    },
                    "mw_kDa": mw_hat,
                    "mw_ci68_kDa": None,
                }
            )
        else:
            raise ValueError(
                "Either provide --calibration or specify --alpha and --beta for Vc-only mode."
            )

    # Write output
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    return result


# ------------------------- CLI -------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Bayesian-ish MW estimator for SAXS.")
    p.add_argument(
        "data_path", help="Path to buffer-subtracted SAXS curve (q I(q) [sigma])."
    )
    p.add_argument("--out", required=True, help="Output JSON path.")
    p.add_argument(
        "--calibration",
        help="JSON file with standards: [{data_path, MW_kDa, conc_g_per_cm3?}, ...]",
    )
    p.add_argument(
        "--use-i0",
        action="store_true",
        help="Use I(0)/c feature (requires concentration).",
    )
    # Mutually exclusive flags to control Vc with a clear default
    vc_group = p.add_mutually_exclusive_group()
    vc_group.add_argument(
        "--use-vc",
        dest="use_vc",
        action="store_true",
        help="Use correlation volume feature (default)",
    )
    vc_group.add_argument(
        "--no-use-vc",
        dest="use_vc",
        action="store_false",
        help="Disable correlation volume feature",
    )
    p.set_defaults(use_vc=True)
    p.add_argument("--use-vp", action="store_true", help="Use Porod volume feature.")
    p.add_argument(
        "--qmax", type=float, help="Optional qmax cutoff for Vc/Vp integrals."
    )
    p.add_argument(
        "--conc",
        type=float,
        help="Sample concentration in g/cm^3 (e.g., mg/mL / 1000). Required if --use-i0.",
    )
    p.add_argument("--alpha", type=float, help="Power-law alpha for Vc-only fallback.")
    p.add_argument("--beta", type=float, help="Power-law beta for Vc-only fallback.")
    return p.parse_args()


def main():
    args = parse_args()
    cfg = EstimationConfig(
        use_i0=bool(args.use_i0),
        use_vc=bool(args.use_vc),
        use_vp=bool(args.use_vp),
        qmax=args.qmax,
        conc=args.conc,
        alpha=args.alpha,
        beta=args.beta,
    )
    estimate_mw(args.data_path, args.out, cfg, calibration_json=args.calibration)


if __name__ == "__main__":
    main()
