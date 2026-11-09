"""Job parameters for BioEmu2 sampling: stdlib only, so tests need no GPU stack."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

PARAMS_FILE = "bioemu/params.json"

# The Phase 0 "steer" config
DEFAULTS = {
    "num_samples_per_rg": 50,
    "batch_size": 40,
    "num_steps": 50,
    "num_gd_steps": 5,
    "rg_weight": 0.02,
    "default_potentials": True,
    "seed": 0,
}

# Fewer physical structures than this across all targets gives MultiFoXS too little to
# work with, so the job fails here with a clear message instead of later in FoXS.
MIN_PHYSICAL_TOTAL = 10


class SamplingError(RuntimeError):
    """A job-level failure to report to the worker (bad input or no usable samples)."""


@dataclass
class Params:
    rgs: list[float]
    num_samples_per_rg: int
    batch_size: int
    num_steps: int
    num_gd_steps: int
    rg_weight: float
    default_potentials: bool
    seed: int

    @classmethod
    def load(cls, path: Path) -> Params:
        try:
            given = json.loads(path.read_text())
        except json.JSONDecodeError as e:
            raise SamplingError(f"{PARAMS_FILE} is not valid JSON: {e}") from e
        if not isinstance(given, dict):
            raise SamplingError(f"{PARAMS_FILE} must hold a JSON object")
        raw = {**DEFAULTS, **given}
        rgs = raw.get("rgs")
        if (
            not isinstance(rgs, list)
            or not rgs
            or not all(isinstance(r, (int, float)) and not isinstance(r, bool) and r > 0 for r in rgs)
        ):
            raise SamplingError(f"{PARAMS_FILE}: 'rgs' must be a non-empty list of positive numbers")
        try:
            params = cls(
                rgs=[float(r) for r in rgs],
                num_samples_per_rg=int(raw["num_samples_per_rg"]),
                batch_size=int(raw["batch_size"]),
                num_steps=int(raw["num_steps"]),
                num_gd_steps=int(raw["num_gd_steps"]),
                rg_weight=float(raw["rg_weight"]),
                default_potentials=bool(raw["default_potentials"]),
                seed=int(raw["seed"]),
            )
        except (TypeError, ValueError) as e:
            raise SamplingError(f"{PARAMS_FILE}: {e}") from e
        for name in ("num_samples_per_rg", "batch_size", "num_steps"):
            if getattr(params, name) < 1:
                raise SamplingError(f"{PARAMS_FILE}: '{name}' must be at least 1")
        if params.num_gd_steps < 0:
            raise SamplingError(f"{PARAMS_FILE}: 'num_gd_steps' must not be negative")
        return params

    def guidance_weight(self) -> float:
        # rg_weight is defined per GD step at 20 GD steps (Phase 0 convention)
        return self.rg_weight * 20 / max(self.num_gd_steps, 1)


def rg_label(rg: float) -> str:
    """rg30 for 30.0, rg30.5 for 30.5: the BilboMD foxs/ directory naming."""
    return f"rg{rg:g}"
