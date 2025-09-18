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
from typing import Optional, Dict, Any, List, Tuple
from saxs_utils import load_profile


# ------------------------- Guinier fit -------------------------


def _weighted_linfit(
    x: np.ndarray, y: np.ndarray, w: Optional[np.ndarray] = None
) -> Tuple[float, float, float]:
    if w is None:
        m, b = np.polyfit(x, y, 1)
        yhat = m * x + b
        ss_res = float(np.sum((y - yhat) ** 2))
        ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    else:
        W = np.diag(w)
        A = np.vstack([x, np.ones_like(x)]).T
        ATA = A.T @ W @ A
        ATy = A.T @ W @ y
        beta = np.linalg.lstsq(ATA, ATy, rcond=None)[0]
        m, b = float(beta[0]), float(beta[1])
        yhat = m * x + b
        ss_res = float(np.sum(w * (y - yhat) ** 2))
        ybar = float(np.sum(w * y) / np.sum(w))
        ss_tot = float(np.sum(w * (y - ybar) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return float(m), float(b), float(r2)


def guinier_fit(
    q: np.ndarray,
    intensity: np.ndarray,
    sigma: Optional[np.ndarray] = None,
    min_points: int = 10,
    min_qrg: float = 0.3,
    max_qrg: float = 1.3,
    r2_floor: float = 0.95,
) -> Dict[str, float]:
    x_all = q**2
    y_all = np.log(intensity)
    w_all = None if sigma is None else 1.0 / (sigma**2)
    n = q.size
    best = None  # (rg, I0, qmin, qmax, i, j, r2)

    for i in range(0, n - min_points + 1):
        for j in range(i + min_points - 1, n):
            x = x_all[i : j + 1]
            y = y_all[i : j + 1]
            w = None if w_all is None else w_all[i : j + 1]
            try:
                m, b, r2 = _weighted_linfit(x, y, w)
            except Exception:
                continue
            if m >= 0:
                continue
            rg = float(np.sqrt(-3.0 * m))
            qrg_min = float(q[i] * rg)
            qrg_max = float(q[j] * rg)
            if not (min_qrg <= qrg_min <= max_qrg and min_qrg <= qrg_max <= max_qrg):
                continue
            if r2 < r2_floor:
                continue
            candidate = (rg, float(np.exp(b)), float(q[i]), float(q[j]), i, j, r2)
            if best is None or candidate[-1] > best[-1]:
                best = candidate
    if best is None:
        # Fallback: first window
        i, j = 0, min_points - 1
        m, b, r2 = _weighted_linfit(
            x_all[i : j + 1],
            y_all[i : j + 1],
            None if w_all is None else w_all[i : j + 1],
        )
        rg = float(np.sqrt(max(0.0, -3.0 * m)))
        best = (rg, float(np.exp(b)), float(q[i]), float(q[j]), i, j, r2)

    rg, I0, qmin, qmax, i, j, r2 = best
    return {"Rg": rg, "I0": I0, "qmin": qmin, "qmax": qmax, "r2": r2}


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
    g = guinier_fit(q, intensity, sigma)
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
            q_s, intensity_s, sig_s = load_profile(spath)
            g_s = guinier_fit(q_s, intensity_s, sig_s)
            I0_s = g_s["I0"]
            feats_s = {}
            if cfg.use_vc:
                feats_s["Vc"] = correlation_volume(q_s, intensity_s, I0_s, cfg.qmax)
            if cfg.use_vp:
                feats_s["Vp"] = porod_volume(q_s, intensity_s, I0_s, cfg.qmax)
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
    p.add_argument(
        "--use-vc",
        action="store_true",
        help="Use correlation volume feature (default true).",
    )
    p.add_argument("--no-use-vc", action="store_true", help="Disable Vc feature.")
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
        use_vc=not bool(args.no_use_vc),
        use_vp=bool(args.use_vp),
        qmax=args.qmax,
        conc=args.conc,
        alpha=args.alpha,
        beta=args.beta,
    )
    estimate_mw(args.data_path, args.out, cfg, calibration_json=args.calibration)


if __name__ == "__main__":
    main()
