"""Tests for the pre-submission model-vs-SAXS mass check."""

import json

import numpy as np
import pytest

import mw_check

RG = 20.0  # a Gaussian profile with this Rg has a Vc MW of ~28.9 kDa


def write_saxs(folder, columns=3, name="saxs.dat"):
    q = np.linspace(0.005, 0.4, 400)
    intensity = 50.0 * np.exp(-((q * RG) ** 2) / 3.0)
    data = [q, intensity, 0.01 * intensity][:columns]
    path = folder / name
    np.savetxt(path, np.column_stack(data), header="q I sigma")
    return path


def write_pdb(folder, residues):
    lines = [
        f"ATOM  {i + 1:5d}  CA  ALA A{i + 1:4d}       0.000   0.000   0.000"
        for i in range(residues)
    ]
    path = folder / "model.pdb"
    path.write_text("\n".join(lines) + "\n")
    return path


def run(capsys, *argv):
    assert mw_check.main([str(a) for a in argv]) == 0
    return json.loads(capsys.readouterr().out)


def test_matching_pdb_is_consistent(tmp_path, capsys):
    result = run(capsys, write_saxs(tmp_path), "--pdb", write_pdb(tmp_path, 406))

    assert result["finding"]["code"] == "mw_consistent"
    assert result["mw"]["model_kda"] == pytest.approx(28.88, abs=0.01)
    assert result["mw"]["saxs_kda"] == pytest.approx(28.9, rel=0.02)
    assert result["mw"]["confidence"] == "normal"


def test_a_model_twice_the_mass_of_the_data_is_flagged(tmp_path, capsys):
    result = run(capsys, write_saxs(tmp_path), "--pdb", write_pdb(tmp_path, 812))

    assert result["finding"]["code"] == "mw_differs"
    assert result["finding"]["severity"] == "warning"
    assert result["mw"]["diff_fraction"] == pytest.approx(-0.5, abs=0.02)


def test_sequences_are_compared_like_a_pdb(tmp_path, capsys):
    entities = tmp_path / "entities.json"
    entities.write_text(
        json.dumps([{"type": "Protein", "sequence": "A" * 203, "copies": 2}])
    )
    result = run(capsys, write_saxs(tmp_path), "--entities", entities)

    assert result["finding"]["code"] == "mw_consistent"
    assert result["mw"]["model_kda"] == pytest.approx(28.89, abs=0.02)


def test_a_psf_is_compared_like_a_pdb(tmp_path, capsys):
    atoms = "\n".join(
        f"{i + 1:10d} PROA     {i + 1:<8d} ALA      CA       CT1      0.070000"
        f"       71.0779           0"
        for i in range(406)
    )
    psf = tmp_path / "model.psf"
    psf.write_text(f"PSF EXT\n\n       406 !NATOM\n{atoms}\n\n         0 !NBOND\n")
    result = run(capsys, write_saxs(tmp_path), "--psf", psf)

    assert result["finding"]["code"] == "mw_consistent"
    assert result["mw"]["model_kda"] == pytest.approx(28.86, abs=0.01)


def test_two_column_data_are_accepted(tmp_path, capsys):
    result = run(
        capsys, write_saxs(tmp_path, columns=2), "--pdb", write_pdb(tmp_path, 406)
    )
    assert result["mw"]["saxs_kda"] == pytest.approx(28.9, rel=0.03)


@pytest.mark.parametrize(
    "model",
    ["REMARK no atoms\nEND\n", ""],
    ids=["no atoms", "empty"],
)
def test_an_unreadable_model_is_reported_not_raised(tmp_path, capsys, model):
    pdb = tmp_path / "model.pdb"
    pdb.write_text(model)
    result = run(capsys, write_saxs(tmp_path), "--pdb", pdb)

    assert result["finding"]["code"] == "mw_not_assessed"
    assert "could not be determined" in result["mw"]["reason"]
    assert result["mw"]["model_kda"] is None


def test_bad_sequences_are_reported_not_raised(tmp_path, capsys):
    entities = tmp_path / "entities.json"
    entities.write_text(json.dumps([{"type": "Protein", "sequence": "MK1"}]))
    result = run(capsys, write_saxs(tmp_path), "--entities", entities)
    assert result["finding"]["code"] == "mw_not_assessed"


def test_unreadable_data_are_reported_with_the_model_mass(tmp_path, capsys):
    saxs = tmp_path / "saxs.dat"
    saxs.write_text("this is not SAXS data\n")
    result = run(capsys, saxs, "--pdb", write_pdb(tmp_path, 406))

    assert result["finding"]["code"] == "mw_not_assessed"
    assert "SAXS data could not be read" in result["mw"]["reason"]
    assert result["mw"]["model_kda"] == pytest.approx(28.88, abs=0.01)


def test_data_without_a_guinier_region_are_not_assessed(tmp_path, capsys):
    q = np.linspace(0.005, 0.4, 400)
    saxs = tmp_path / "saxs.dat"
    np.savetxt(saxs, np.column_stack([q, 1 + 10 * q, 0.01 * (1 + 10 * q)]))
    result = run(capsys, saxs, "--pdb", write_pdb(tmp_path, 406))

    assert result["finding"]["code"] == "mw_not_assessed"
    assert "Guinier" in result["mw"]["reason"]


def test_a_model_is_required(tmp_path):
    with pytest.raises(SystemExit):
        mw_check.main([str(write_saxs(tmp_path))])
