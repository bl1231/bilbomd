"""Tests for the SAXS fit assessment that produces feedback.json."""

import json

import numpy as np
import pytest

import pipeline_decision_tree as pdt
from saxs_fit import RegionStats

LEGACY_KEYS = {
    "mw_saxs",
    "mw_model",
    "mw_err",
    "best_model_dat_file",
    "best_ensemble_pdb_file",
    "overall_chi_square",
    "q_ranges",
    "chi_squares_of_regions",
    "residuals_of_regions",
    "mw_feedback",
    "overall_chi_square_feedback",
    "highest_chi_square_feedback",
    "second_highest_chi_square_feedback",
    "regional_chi_square_feedback",
}

RG = 20.0  # Gaussian profile with this Rg has a Vc MW of ~28.9 kDa as a protein


# ----------------------------------------------------------------- fixtures


def write_fit_file(folder, states, *, q_max=0.4, low_q_shift=0.0, noise=1.0, seed=0):
    """
    Write multi_state_model_<states>_1_1.dat for a Gaussian-shaped profile.
    `noise` scales the random residuals (chi-square ~ noise^2) and
    `low_q_shift` adds a systematic offset, in sigmas, below q = 0.1.
    """
    rng = np.random.default_rng(seed)
    q = np.linspace(0.005, q_max, int(round((q_max - 0.005) * 1000)) + 1)
    i_model = 50.0 * np.exp(-((q * RG) ** 2) / 3.0) + 0.05
    err = 0.02 * i_model
    residuals = noise * rng.standard_normal(q.size) + np.where(q < 0.1, low_q_shift, 0)
    path = folder / f"multi_state_model_{states}_1_1.dat"
    np.savetxt(
        path,
        np.column_stack([q, i_model + residuals * err, i_model, err]),
        header=" q       exp_intensity   model_intensity error",
    )
    return path


def write_pdb(folder, name="ensemble_size_1_model.pdb", carbons=2400, dna=0):
    """A PDB of `carbons` protein carbon atoms (2400 -> 28.8 kDa) plus DNA carbons."""
    lines = [
        f"ATOM  {i + 1:5d}  CA  ALA A{(i % 9999) + 1:4d}       0.000   0.000   0.000"
        f"  1.00  0.00      PROA"
        for i in range(carbons)
    ] + [
        f"ATOM  {i + 1:5d}  C4' ADE A{(i % 9999) + 1:4d}       0.000   0.000   0.000"
        f"  1.00  0.00      DNAA"
        for i in range(dna)
    ]
    path = folder / name
    path.write_text("\n".join(lines) + "\n")
    return path


def region(name, chi, q_min=0.01, q_max=0.1):
    return RegionStats(name, q_min, q_max, 100, chi, 0.0)


def codes(findings):
    return [f["code"] for f in findings]


# ------------------------------------------------------------ model choice


@pytest.mark.parametrize(
    "chi_squares, expected",
    [
        ([1.23], 0),
        ([1.23, 1.16, 4.64], 0),  # 2 states barely better
        ([5.62, 2.78, 2.70, 2.98], 1),  # big gain to 2 states, then flat
        ([1.46, 1.00, 0.98, 0.97], 1),
        ([3.0, 2.0, 1.0], 2),  # every extra state earns its place
        ([1.0, 1.5, 1.4], 0),  # worse with 2 states: used to pick 1.5
        ([0.0, 1.0], 0),
    ],
)
def test_select_model_prefers_the_fewest_states_that_fit(chi_squares, expected):
    assert pdt.select_model(chi_squares) == expected


def test_fit_files_are_ordered_by_number_of_states(tmp_path):
    for states in (10, 2, 1, 11):
        (tmp_path / f"multi_state_model_{states}_1_1.dat").touch()
    for other in (
        "multi_state_model_1_1_1.dat.bak",
        "multi_state_model_3_2_1.dat",
        "ensemble_size_1_model.pdb",
        "multi_state_model_x_1_1.dat",
    ):
        (tmp_path / other).touch()

    assert [f.states for f in pdt.find_fit_files(tmp_path)] == [1, 2, 10, 11]


def test_model_pdb_skips_empty_files(tmp_path):
    (tmp_path / "ensemble_size_1_model.pdb").touch()  # 0 bytes, seen on real jobs
    assert pdt.find_model_pdb(tmp_path) is None

    fallback = write_pdb(tmp_path, "minimization_output.pdb")
    assert pdt.find_model_pdb(tmp_path) == fallback


# ---------------------------------------------------------------- findings


@pytest.mark.parametrize(
    "chi, code, severity",
    [
        (0.2, "fit_below_noise", "info"),
        (0.49, "fit_below_noise", "info"),
        (0.5, "fit_excellent", "good"),
        (0.99, "fit_excellent", "good"),
        (1.0, "fit_acceptable", "info"),
        (1.99, "fit_acceptable", "info"),
        (2.0, "fit_poor", "problem"),
        (40.0, "fit_poor", "problem"),
    ],
)
def test_overall_finding_bands(chi, code, severity):
    finding = pdt.overall_finding(chi)
    assert (finding["code"], finding["severity"]) == (code, severity)
    assert f"{chi:.2f}" in finding["title"]


def test_no_region_stands_out_when_all_are_acceptable():
    findings = pdt.region_findings(
        1.2, [region("low", 1.8), region("mid", 2.0), region("high", 0.3)]
    )
    assert codes(findings) == ["regions_ok"]
    assert findings[0]["severity"] == "good"


def test_misfit_regions_are_listed_worst_first():
    findings = pdt.region_findings(
        3.5, [region("low", 2.5), region("mid", 6.0), region("high", 1.0)]
    )
    assert codes(findings) == ["misfit_mid_q", "misfit_low_q"]
    assert [f["region"] for f in findings] == ["mid", "low"]
    assert {f["severity"] for f in findings} == {"problem"}
    assert "6.00" in findings[0]["title"]


def test_a_local_misfit_in_a_good_overall_fit_is_only_a_warning():
    findings = pdt.region_findings(
        0.9, [region("low", 2.4), region("mid", 0.8), region("high", 0.7)]
    )
    assert codes(findings) == ["misfit_low_q"]
    assert findings[0]["severity"] == "warning"


def test_equal_chi_squares_are_reported_as_separate_regions():
    # The old code looked regions up by value and named the same one twice
    findings = pdt.region_findings(3.0, [region("low", 3.0), region("mid", 3.0)])
    assert sorted(codes(findings)) == ["misfit_low_q", "misfit_mid_q"]


def test_no_regions_no_region_findings():
    assert pdt.region_findings(1.0, []) == []


def test_advice_does_not_name_tools_a_job_type_may_lack():
    for advice in pdt.REGION_ADVICE.values():
        assert "PAE" not in advice
        assert "const.inp" not in advice


def mw_block(**overrides):
    block = {
        "model_kda": 50.0,
        "saxs_kda": 55.0,
        "diff_fraction": 0.10,
        "confidence": "normal",
        "reason": None,
    }
    block.update(overrides)
    return block


@pytest.mark.parametrize(
    "block, code, severity",
    [
        (mw_block(), "mw_consistent", "good"),
        (mw_block(diff_fraction=-0.30), "mw_consistent", "good"),
        (mw_block(diff_fraction=0.31), "mw_differs", "warning"),
        (mw_block(saxs_kda=80.0, diff_fraction=0.60), "mw_differs", "warning"),
        (mw_block(saxs_kda=25.0, diff_fraction=-0.50), "mw_differs", "warning"),
        (
            mw_block(diff_fraction=0.60, confidence="low", reason="A mixture."),
            "mw_low_confidence",
            "info",
        ),
        (
            mw_block(saxs_kda=None, diff_fraction=None, reason="No Guinier."),
            "mw_not_assessed",
            "info",
        ),
        (
            mw_block(model_kda=None, saxs_kda=None, diff_fraction=None),
            "mw_not_assessed",
            "info",
        ),
    ],
)
def test_mw_finding(block, code, severity):
    finding = pdt.mw_finding(block)
    assert (finding["code"], finding["severity"]) == (code, severity)


def test_mw_finding_is_never_worse_than_a_warning():
    finding = pdt.mw_finding(mw_block(saxs_kda=500.0, diff_fraction=9.0))
    assert finding["severity"] == "warning"
    assert "higher" in finding["detail"] and "aggregation" in finding["detail"]


# ------------------------------------------------------------- full report


def test_report_for_a_good_job(tmp_path):
    write_fit_file(tmp_path, 1, noise=1.3, seed=1)
    write_fit_file(tmp_path, 2, noise=0.9, seed=2)
    write_fit_file(tmp_path, 3, noise=0.88, seed=2)
    write_pdb(tmp_path)

    report = pdt.build_report(tmp_path)

    assert report["version"] == 2
    assert LEGACY_KEYS <= report.keys()
    json.dumps(report)  # everything is JSON-serialisable

    assert [m["states"] for m in report["models"]] == [1, 2, 3]
    assert [m["selected"] for m in report["models"]] == [False, True, False]
    assert report["best_model_dat_file"] == "multi_state_model_2_1_1.dat"

    assert [r["name"] for r in report["regions"]] == ["low", "mid", "high"]
    assert len(report["q_ranges"]) == 4
    assert report["q_ranges"] == sorted(report["q_ranges"])
    assert len(report["chi_squares_of_regions"]) == 3

    assert codes(report["findings"]) == ["fit_excellent", "regions_ok", "mw_consistent"]
    assert report["mw"]["model_kda"] == pytest.approx(28.83, abs=0.01)
    assert report["mw"]["saxs_kda"] == pytest.approx(28.9, rel=0.05)
    assert report["mw"]["confidence"] == "normal"
    assert report["mw_model"] == report["mw"]["model_kda"]
    assert report["mw_err"] == pytest.approx(abs(report["mw"]["diff_fraction"]))
    assert report["best_ensemble_pdb_file"] == "ensemble_size_1_model.pdb"


def test_mw_mismatch_does_not_replace_the_fit_findings(tmp_path):
    # The old report swapped every fit message for "check your sequence or
    # oligomerization state" when MW differed by more than 30 %.
    write_fit_file(tmp_path, 1, noise=0.9)
    write_pdb(tmp_path, carbons=6000)  # 72 kDa model, ~29 kDa data

    report = pdt.build_report(tmp_path)

    assert codes(report["findings"]) == ["fit_excellent", "regions_ok", "mw_differs"]
    assert "Excellent" in report["overall_chi_square_feedback"]
    assert "No q-region stands out" in report["regional_chi_square_feedback"]
    assert "lower" in report["mw_feedback"]


def test_protein_dna_complex_gets_a_low_confidence_mw(tmp_path):
    write_fit_file(tmp_path, 1)
    write_pdb(tmp_path, carbons=1600, dna=800)

    report = pdt.build_report(tmp_path)

    assert report["mw"]["nucleic_fraction"] == pytest.approx(1 / 3, abs=0.001)
    assert report["mw"]["confidence"] == "low"
    assert codes(report["findings"])[-1] == "mw_low_confidence"


def test_noisy_guinier_region_gets_a_low_confidence_mw(tmp_path, monkeypatch):
    # A mismatch built on a weak Guinier fit is shown but never a warning
    import saxs_mw

    monkeypatch.setattr(saxs_mw, "GUINIER_R2_GOOD", 1.01)
    write_fit_file(tmp_path, 1, noise=0.9)
    write_pdb(tmp_path, carbons=6000)

    report = pdt.build_report(tmp_path)

    assert report["mw"]["confidence"] == "low"
    assert "Guinier" in report["mw"]["reason"]
    assert codes(report["findings"])[-1] == "mw_low_confidence"
    assert report["findings"][-1]["severity"] == "info"


def test_low_q_misfit_is_reported(tmp_path):
    write_fit_file(tmp_path, 1, low_q_shift=4.0)
    write_pdb(tmp_path)

    report = pdt.build_report(tmp_path)

    assert codes(report["findings"])[:2] == ["fit_poor", "misfit_low_q"]
    assert "oligomeric state" in report["regional_chi_square_feedback"]
    assert report["highest_chi_square_feedback"].startswith("χ² is highest")


@pytest.mark.parametrize("pdb", ["missing", "empty", "no atoms"])
def test_report_survives_an_unusable_model_pdb(tmp_path, pdb):
    # Both used to crash the script and leave the tab empty
    write_fit_file(tmp_path, 1, noise=0.9)
    if pdb == "empty":
        (tmp_path / "ensemble_size_1_model.pdb").touch()
    elif pdb == "no atoms":
        (tmp_path / "ensemble_size_1_model.pdb").write_text("REMARK no atoms\nEND\n")

    report = pdt.build_report(tmp_path)

    assert codes(report["findings"]) == [
        "fit_excellent",
        "regions_ok",
        "mw_not_assessed",
    ]
    assert report["mw_saxs"] is None and report["mw_model"] is None
    assert report["mw_err"] is None
    assert report["mw"]["reason"]
    assert report["overall_chi_square"] == pytest.approx(0.81, abs=0.15)


def test_report_falls_back_to_the_minimized_pdb(tmp_path):
    write_fit_file(tmp_path, 1)
    (tmp_path / "ensemble_size_1_model.pdb").touch()
    write_pdb(tmp_path, "minimization_output.pdb")

    report = pdt.build_report(tmp_path)

    assert report["best_ensemble_pdb_file"] == "minimization_output.pdb"
    assert report["mw"]["model_kda"] == pytest.approx(28.83, abs=0.01)


@pytest.mark.parametrize("q_max, names", [(0.15, ["low", "mid"]), (0.08, ["low"])])
def test_report_for_data_with_a_short_q_range(tmp_path, q_max, names):
    # q_max below 0.2 used to divide by zero
    write_fit_file(tmp_path, 1, q_max=q_max)
    write_pdb(tmp_path)

    report = pdt.build_report(tmp_path)

    assert [r["name"] for r in report["regions"]] == names
    assert len(report["q_ranges"]) == len(names) + 1
    assert report["highest_chi_square_feedback"]
    assert (report["second_highest_chi_square_feedback"] is None) == (len(names) == 1)
    assert report["mw"]["confidence"] == "low"  # integral stops short of 0.3


def test_report_with_ten_or_more_states(tmp_path):
    # The same noise scaled down 17 % per state lowers chi-square by 31 % each
    # time, so every state earns its place and the last is selected. The old
    # lexicographic sort put 10 before 2.
    for states in range(1, 12):
        write_fit_file(tmp_path, states, noise=3.0 * 0.83**states)
    write_pdb(tmp_path)

    report = pdt.build_report(tmp_path)

    assert [m["states"] for m in report["models"]] == list(range(1, 12))
    assert report["best_model_dat_file"] == "multi_state_model_11_1_1.dat"


def test_no_fit_files_is_an_error(tmp_path):
    write_pdb(tmp_path)
    with pytest.raises(FileNotFoundError):
        pdt.build_report(tmp_path)


# --------------------------------------------------------------------- CLI


def test_main_writes_feedback_json_to_the_working_directory(tmp_path, monkeypatch):
    results = tmp_path / "results"
    results.mkdir()
    write_fit_file(results, 1)
    write_pdb(results)
    (results / "temp").mkdir()  # the old script deleted ./temp
    monkeypatch.chdir(results)

    assert pdt.main([str(results)]) == 0

    report = json.loads((results / "feedback.json").read_text(encoding="utf-8"))
    assert report["version"] == 2
    assert LEGACY_KEYS <= report.keys()
    assert (results / "temp").is_dir()


def test_main_fails_cleanly_without_fit_files(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)

    assert pdt.main([str(tmp_path)]) == 1

    assert "Cannot assess this job" in capsys.readouterr().err
    assert not (tmp_path / "feedback.json").exists()
