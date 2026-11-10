"""
Assess how well a finished BilboMD job's models fit the SAXS data, and say
where a misfit most likely comes from.

Usage:
    python pipeline_decision_tree.py <results_dir>

Reads the MultiFoXS fits (multi_state_model_N_1_1.dat) and a model PDB from
the results folder and writes feedback.json to the current directory.

The interpretation of each q-region follows the original decision tree by
Joshua Del Mundo (SIBYLS): low q reports on size and oligomeric state, mid q
on flexibility and domain arrangement, high q on buffer subtraction.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Sequence

from pdb_utils import molecular_composition
from saxs_fit import FitProfile, RegionStats, chi_square, load_fit_file, region_stats
from saxs_mw import METHOD as MW_METHOD
from saxs_mw import estimate_mw_vc

__author__ = "Joshua Del Mundo"
__version__ = "2.0.0"
__license__ = "SIBYLS"

logger = logging.getLogger("feedback")

# Version of the feedback.json layout. 2 added findings, regions, models, mw.
REPORT_VERSION = 2
OUTPUT_FILENAME = "feedback.json"

# Chi-square bands. Below CHI2_OVERFIT the model agrees with the data better
# than the stated errors allow.
CHI2_OVERFIT = 0.5
CHI2_EXCELLENT = 1.0
CHI2_ACCEPTABLE = 2.0

# Adding a state must lower chi-square by at least this fraction to be worth
# the extra state.
MODEL_IMPROVEMENT_MIN = 0.20

# The SAXS MW estimate is good to roughly 10-20 %, and on real BilboMD jobs
# with a good fit it reads up to ~25 % low for flexible multi-domain proteins.
# Only a larger difference from the model is worth pointing out.
MW_DIFF_WARN = 0.30

# Between these nucleic-acid mass fractions the sample is a protein-nucleic
# acid mixture, for which neither set of Vc constants applies.
NUCLEIC_FRACTION_PROTEIN_MAX = 0.05
NUCLEIC_FRACTION_NUCLEIC_MIN = 0.95

FIT_FILE_PATTERN = re.compile(r"^multi_state_model_(\d+)_1_1\.dat$")

# Model PDBs in order of preference. Any of them has the full system once;
# only its mass and composition are used.
MODEL_PDB_CANDIDATES = (
    "ensemble_size_1_model.pdb",
    "minimization_output.pdb",
    "minimized.pdb",
)

SEVERITIES = ("good", "info", "warning", "problem")

REGION_LABELS = {"low": "low q", "mid": "mid q", "high": "high q"}

# What a misfit in each q-region usually means, and what to try.
REGION_ADVICE = {
    "low": (
        "Low q reflects the overall size and mass of the particle. A misfit here "
        "usually means the model's size differs from the sample: check the "
        "sequence and oligomeric state, and look for aggregation or "
        "inter-particle effects in the Guinier region of the data."
    ),
    "mid": (
        "Mid q reflects the overall shape and the arrangement of domains. A "
        "misfit here suggests the conformations sampled do not cover the "
        "solution state: revisit which regions are allowed to move, or widen "
        "the Rg range that is sampled."
    ),
    "high": (
        "High q carries weak signal and is sensitive to buffer subtraction. A "
        "misfit here often points to the subtraction rather than the model: "
        "re-check the buffer subtraction or trim the noisy high-q end of the data."
    ),
}


class FitFile(NamedTuple):
    states: int
    path: Path


def find_fit_files(results_dir: Path) -> List[FitFile]:
    """MultiFoXS fit files in the results folder, ordered by number of states."""
    fits = []
    for path in results_dir.iterdir():
        match = FIT_FILE_PATTERN.match(path.name)
        if match:
            fits.append(FitFile(int(match.group(1)), path))
    return sorted(fits)


def find_model_pdb(results_dir: Path) -> Optional[Path]:
    """First model PDB in the results folder that exists and is not empty."""
    for name in MODEL_PDB_CANDIDATES:
        path = results_dir / name
        if path.is_file() and path.stat().st_size > 0:
            return path
    return None


def select_model(chi_squares: Sequence[float]) -> int:
    """
    Index of the most parsimonious model: the smallest number of states for
    which adding one more state lowers chi-square by less than
    MODEL_IMPROVEMENT_MIN. A next state that fits worse also ends the search.
    """
    for index in range(len(chi_squares) - 1):
        current, following = chi_squares[index], chi_squares[index + 1]
        if current <= 0:
            return index
        improvement = (current - following) / current
        if improvement < MODEL_IMPROVEMENT_MIN:
            return index
    return len(chi_squares) - 1


def _finding(
    code: str, severity: str, title: str, detail: str, region: Optional[str] = None
) -> Dict[str, str]:
    assert severity in SEVERITIES
    finding = {"code": code, "severity": severity, "title": title, "detail": detail}
    if region is not None:
        finding["region"] = region
    return finding


def _q_range(region: RegionStats) -> str:
    return f"{region.q_min:.2f} < q < {region.q_max:.2f} Å⁻¹"


def overall_finding(overall: float) -> Dict[str, str]:
    """One finding for the overall chi-square."""
    if overall < CHI2_OVERFIT:
        return _finding(
            "fit_below_noise",
            "info",
            f"χ² is {overall:.2f}, well below 1",
            "The model agrees with the data more closely than the stated errors "
            "allow. The experimental errors are probably over-estimated, or the "
            "fit is absorbing noise. The fit is acceptable, but χ² cannot rank "
            "models for this data set; judge it by the residuals.",
        )
    if overall < CHI2_EXCELLENT:
        return _finding(
            "fit_excellent",
            "good",
            f"Excellent fit (χ² {overall:.2f})",
            "The model fits the data to within the experimental errors.",
        )
    if overall < CHI2_ACCEPTABLE:
        return _finding(
            "fit_acceptable",
            "info",
            f"Acceptable fit (χ² {overall:.2f})",
            "The model fits the data reasonably well, with some deviation beyond "
            "the experimental errors.",
        )
    return _finding(
        "fit_poor",
        "problem",
        f"Poor fit (χ² {overall:.2f})",
        "The model does not fit the data to within the experimental errors.",
    )


def region_findings(overall: float, regions: Sequence[RegionStats]) -> List[Dict]:
    """
    One finding per q-region whose chi-square exceeds CHI2_ACCEPTABLE, worst
    first, or a single all-clear when none does.
    """
    if not regions:
        return []

    misfits = sorted(
        (r for r in regions if r.chi_square > CHI2_ACCEPTABLE),
        key=lambda r: r.chi_square,
        reverse=True,
    )
    if not misfits:
        return [
            _finding(
                "regions_ok",
                "good",
                "No q-region stands out",
                f"χ² is {CHI2_ACCEPTABLE:g} or lower in every q-region assessed "
                f"({', '.join(REGION_LABELS[r.name] for r in regions)}).",
            )
        ]

    # A local misfit matters more when the fit as a whole is also poor.
    severity = "problem" if overall >= CHI2_ACCEPTABLE else "warning"
    return [
        _finding(
            f"misfit_{region.name}_q",
            severity,
            f"Misfit at {REGION_LABELS[region.name]} "
            f"({_q_range(region)}, χ² {region.chi_square:.2f})",
            REGION_ADVICE[region.name],
            region=region.name,
        )
        for region in misfits
    ]


def assess_mw(profile: FitProfile, model_pdb: Optional[Path]) -> Dict:
    """
    Compare the model's mass with a SAXS estimate. Returns the `mw` block of
    the report. Values that could not be determined are None and `reason`
    says why.
    """
    mw: Dict = {
        "model_kda": None,
        "saxs_kda": None,
        "diff_fraction": None,
        "method": MW_METHOD,
        "particle": None,
        "confidence": None,
        "nucleic_fraction": None,
        "model_pdb_file": model_pdb.name if model_pdb else None,
        "qmax_used": None,
        "guinier": None,
        "reason": None,
    }

    if model_pdb is None:
        mw["reason"] = "No model PDB file was found in the results."
        return mw

    composition = molecular_composition(model_pdb)
    polymer_da = composition["protein_da"] + composition["nucleic_da"]
    nucleic_fraction = composition["nucleic_da"] / polymer_da if polymer_da > 0 else 0.0
    mixture = (
        NUCLEIC_FRACTION_PROTEIN_MAX < nucleic_fraction < NUCLEIC_FRACTION_NUCLEIC_MIN
    )
    particle = "rna" if nucleic_fraction >= NUCLEIC_FRACTION_NUCLEIC_MIN else "protein"
    mw["model_kda"] = round(composition["total_da"] / 1000.0, 2)
    mw["nucleic_fraction"] = round(nucleic_fraction, 3)
    mw["particle"] = particle

    estimate = estimate_mw_vc(profile.q, profile.i_exp, profile.err, particle=particle)
    if estimate.rg is not None:
        mw["guinier"] = {
            "rg": round(estimate.rg, 2),
            "i0": estimate.i0,
            "r2": estimate.guinier_r2,
            "qmin": estimate.guinier_qmin,
            "qmax": estimate.guinier_qmax,
        }
    if not estimate.assessed:
        mw["reason"] = estimate.reason
        return mw

    mw["saxs_kda"] = round(estimate.mw_kda, 2)
    mw["diff_fraction"] = round(
        (estimate.mw_kda - mw["model_kda"]) / mw["model_kda"], 4
    )
    mw["qmax_used"] = estimate.qmax_used
    mw["confidence"] = "low" if mixture or estimate.short_q_range else "normal"
    if mixture:
        mw["reason"] = (
            f"The model is {nucleic_fraction:.0%} nucleic acid by mass. The SAXS "
            "estimate assumes a pure protein, so it is only indicative here."
        )
    elif estimate.short_q_range:
        mw["reason"] = (
            f"The data end at q = {estimate.qmax_used:.2f} Å⁻¹, short of the "
            "0.3 Å⁻¹ the method expects, so the estimate is only indicative."
        )
    return mw


def mw_finding(mw: Dict) -> Dict[str, str]:
    """The advisory molecular-weight finding. Never worse than a warning."""
    if mw["saxs_kda"] is None or mw["model_kda"] is None:
        return _finding(
            "mw_not_assessed",
            "info",
            "Molecular weight not assessed",
            mw["reason"] or "The molecular weight could not be estimated.",
        )

    title = (
        f"Molecular weight: model {mw['model_kda']:.1f} kDa, "
        f"SAXS estimate {mw['saxs_kda']:.1f} kDa"
    )
    diff = mw["diff_fraction"]
    direction = "higher" if diff > 0 else "lower"

    if mw["confidence"] == "low":
        return _finding(
            "mw_low_confidence",
            "info",
            title,
            f"The SAXS estimate is {abs(diff):.0%} {direction} than the model. "
            f"{mw['reason']}",
        )
    if abs(diff) <= MW_DIFF_WARN:
        return _finding(
            "mw_consistent",
            "good",
            title,
            f"The SAXS estimate is {abs(diff):.0%} {direction} than the model. SAXS "
            "mass estimates are typically good to 10–20%, and can be further off "
            "for flexible or elongated particles, so this is not a significant "
            "difference.",
        )
    return _finding(
        "mw_differs",
        "warning",
        title,
        f"The SAXS estimate is {abs(diff):.0%} {direction} than the model. SAXS "
        "mass estimates are approximate, and less reliable for flexible or "
        "elongated particles, but a difference this large is worth checking: "
        "the sequence or construct, the oligomeric state"
        + (", and aggregation." if diff > 0 else "."),
    )


def _legacy_region_sentence(regions: Sequence[RegionStats], rank: int) -> Optional[str]:
    """Sentence about the region with the highest (rank 0) or next chi-square."""
    ranked = sorted(regions, key=lambda r: r.chi_square, reverse=True)
    if rank >= len(ranked):
        return None
    region = ranked[rank]
    ordinal = "highest" if rank == 0 else "second highest"
    sentence = f"χ² is {ordinal} ({region.chi_square:.2f}) for {_q_range(region)}"
    if region.chi_square <= CHI2_ACCEPTABLE:
        return sentence + ", which is acceptable."
    return sentence + "."


def build_report(results_dir: Path) -> Dict:
    """Assess the job in `results_dir` and return the feedback.json content."""
    fit_files = find_fit_files(results_dir)
    if not fit_files:
        raise FileNotFoundError(
            f"No multi_state_model_N_1_1.dat files found in {results_dir}"
        )

    profiles = [load_fit_file(fit.path) for fit in fit_files]
    chi_squares = [chi_square(profile) for profile in profiles]
    selected = select_model(chi_squares)
    profile = profiles[selected]
    # Banded on the rounded value so the verdict always matches the number shown.
    overall = round(chi_squares[selected], 2)
    logger.info(
        "chi-square by number of states: %s; assessing the %d-state model",
        ", ".join(f"{f.states}: {c:.2f}" for f, c in zip(fit_files, chi_squares)),
        fit_files[selected].states,
    )

    regions = region_stats(profile)
    for region in regions:
        logger.info(
            "%s (%s): chi-square %.2f, mean residual %.3f, %d points",
            REGION_LABELS[region.name],
            _q_range(region),
            region.chi_square,
            region.mean_residual,
            region.n_points,
        )

    # The MW comparison is advisory and independent of the fit assessment: if
    # it cannot be made, everything else is still reported.
    model_pdb = find_model_pdb(results_dir)
    try:
        mw = assess_mw(profile, model_pdb)
    except Exception as error:  # noqa: BLE001 - any failure here is non-fatal
        logger.warning("molecular weight assessment failed: %s", error)
        mw = assess_mw(profile, None)
        mw["model_pdb_file"] = model_pdb.name if model_pdb else None
        mw["reason"] = f"The molecular weight could not be assessed: {error}"
    logger.info("molecular weight: %s", mw)

    fit = overall_finding(overall)
    regional = region_findings(overall, regions)
    mass = mw_finding(mw)
    findings = [fit, *regional, mass]
    for finding in findings:
        logger.info(
            "[%s] %s — %s", finding["severity"], finding["title"], finding["detail"]
        )

    edges = [regions[0].q_min] + [r.q_max for r in regions] if regions else []
    diff = mw["diff_fraction"]

    return {
        "version": REPORT_VERSION,
        "findings": findings,
        "models": [
            {
                "states": fit_file.states,
                "file": fit_file.path.name,
                "chi_square": round(chi, 2),
                "selected": index == selected,
            }
            for index, (fit_file, chi) in enumerate(zip(fit_files, chi_squares))
        ],
        "regions": [
            {
                "name": r.name,
                "q_min": r.q_min,
                "q_max": r.q_max,
                "n_points": r.n_points,
                "chi_square": round(r.chi_square, 2),
                "mean_residual": round(r.mean_residual, 3) + 0.0,
            }
            for r in regions
        ],
        "mw": mw,
        # Fields from the first version of this report, kept so stored jobs,
        # the results download and API clients read the same keys as before.
        "mw_saxs": mw["saxs_kda"],
        "mw_model": mw["model_kda"],
        "mw_err": None if diff is None else round(abs(diff), 4),
        "best_model_dat_file": fit_files[selected].path.name,
        "best_ensemble_pdb_file": mw["model_pdb_file"],
        "overall_chi_square": overall,
        "q_ranges": edges,
        "chi_squares_of_regions": [round(r.chi_square, 2) for r in regions],
        "residuals_of_regions": [round(r.mean_residual, 3) + 0.0 for r in regions],
        "mw_feedback": f"{mass['title']}. {mass['detail']}",
        "overall_chi_square_feedback": f"{fit['title']}. {fit['detail']}",
        "highest_chi_square_feedback": _legacy_region_sentence(regions, 0),
        "second_highest_chi_square_feedback": _legacy_region_sentence(regions, 1),
        "regional_chi_square_feedback": " ".join(
            f"{finding['title']}. {finding['detail']}" for finding in regional
        )
        or None,
    }


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Assess the SAXS fit of a finished BilboMD job."
    )
    parser.add_argument("results", help="results folder of the BilboMD job")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

    try:
        report = build_report(Path(args.results))
    except (FileNotFoundError, ValueError) as error:
        print(f"Cannot assess this job: {error}", file=sys.stderr)
        return 1

    with open(OUTPUT_FILENAME, "w", encoding="utf-8") as outfile:
        json.dump(report, outfile, indent=4, ensure_ascii=False)
    logger.info("wrote %s", OUTPUT_FILENAME)
    return 0


if __name__ == "__main__":
    sys.exit(main())
