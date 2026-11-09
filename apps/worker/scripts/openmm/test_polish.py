"""Tests for polish.py (BioEmu2 ensemble-member polishing, bilbomd#1200).

Needs the OpenMM stack, so it runs inside the worker image (CI: worker-python-tests)
and is skipped elsewhere.
"""

from __future__ import annotations

import json
import math

import pytest

pytest.importorskip("openmm")
pytest.importorskip("pdbfixer")

import numpy as np
import polish
from openmm import Platform


def _place(a, b, c, bond, angle, torsion):
    """NeRF: the atom bonded to c, given bond length, angle b-c-x and torsion a-b-c-x."""
    angle, torsion = math.radians(angle), math.radians(torsion)
    bc = (c - b) / np.linalg.norm(c - b)
    n = np.cross(b - a, bc)
    n /= np.linalg.norm(n)
    m = np.cross(n, bc)
    d = np.array([-bond * math.cos(angle), bond * math.sin(angle) * math.cos(torsion), bond * math.sin(angle) * math.sin(torsion)])
    return c + d[0] * bc + d[1] * m + d[2] * n


def backbone_pdb(n_res: int = 4, resname: str = "ALA") -> str:
    """Poly-residue backbone (N, CA, C only) in a beta-strand conformation."""
    coords = [np.array([0.0, 1.458, 0.0]), np.array([0.0, 0.0, 0.0]), np.array([1.525, 0.0, 0.0])]  # N, CA, C
    phi, psi, omega = -120.0, 130.0, 180.0
    for _ in range(n_res - 1):
        n = _place(coords[-3], coords[-2], coords[-1], 1.329, 116.2, psi)
        ca = _place(coords[-2], coords[-1], n, 1.458, 121.7, omega)
        c = _place(coords[-1], n, ca, 1.525, 111.2, phi)
        coords += [n, ca, c]
    lines = []
    for i, xyz in enumerate(coords):
        name = ("N", "CA", "C")[i % 3]
        res = i // 3 + 1
        lines.append(
            f"ATOM  {i + 1:5d}  {name:<3s} {resname} A{res:4d}    "
            f"{xyz[0]:8.3f}{xyz[1]:8.3f}{xyz[2]:8.3f}  1.00  0.00           {name[0]}"
        )
    return "\n".join(lines) + "\nEND\n"


@pytest.fixture
def cpu():
    return Platform.getPlatformByName("CPU")


def test_forcefield_rule_matches_openmm_functions():
    assert polish.forcefield_files(backbone_pdb())[0][0] == "amber19-all.xml"
    with_tpo = backbone_pdb().replace(" ALA A   2", " TPO A   2")
    files, charmm = polish.forcefield_files(with_tpo)
    assert files == ["charmm36_2024.xml", "implicit/gbn2.xml"]
    assert charmm is True


def test_polish_completes_the_model_and_keeps_its_shape(tmp_path, cpu):
    src = tmp_path / "member.pdb"
    src.write_text(backbone_pdb())
    out = tmp_path / "member_polished.pdb"

    r = polish.polish({"in": str(src), "out": str(out)}, cpu)

    assert r["ok"] is True
    assert r["forcefield"] == "amber19-all.xml"
    assert math.isfinite(r["energy_after"])
    assert r["heavy_rmsd"] < 1.0  # restrained: the shape must not move
    assert abs(r["rg_after"] - r["rg_before"]) < 0.5
    text = out.read_text()
    # PDBFixer added the side chains, carbonyl O and hydrogens
    assert " CB " in text and " O  " in text and " H" in text


def test_main_keeps_going_after_a_bad_structure(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMM_PLATFORM", "CPU")
    good = tmp_path / "good.pdb"
    good.write_text(backbone_pdb())
    jobs = [
        {"in": str(tmp_path / "missing.pdb"), "out": str(tmp_path / "missing_out.pdb")},
        {"in": str(good), "out": str(tmp_path / "good_out.pdb")},
    ]
    jobs_file = tmp_path / "jobs.json"
    jobs_file.write_text(json.dumps(jobs))
    results_file = tmp_path / "results.json"

    assert polish.main(["polish.py", str(jobs_file), str(results_file)]) == 0

    results = json.loads(results_file.read_text())
    assert [r["ok"] for r in results] == [False, True]
    assert "error" in results[0]


def test_main_fails_when_nothing_could_be_polished(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMM_PLATFORM", "CPU")
    jobs_file = tmp_path / "jobs.json"
    jobs_file.write_text(json.dumps([{"in": str(tmp_path / "nope.pdb"), "out": str(tmp_path / "o.pdb")}]))
    assert polish.main(["polish.py", str(jobs_file), str(tmp_path / "r.json")]) == 1


def test_main_usage_error():
    assert polish.main(["polish.py"]) == 2
