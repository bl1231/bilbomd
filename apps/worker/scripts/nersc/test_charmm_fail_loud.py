"""Tests that NERSC CHARMM jobs fail instead of reporting Success on bad output.

Each case here once let a job finish as COMPLETED with missing or wrong
results: CHARMM exits 0 when it cannot open an input file (bomlev -2), meld's
exit code was never checked, remediation exited 0 when dcd2pdb produced no
PDBs, and the FoXS script always exited 0.
"""

from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).parent
STATUS = "meld: Running 1\nminimize: Running 1\npdb_remediate: Waiting\n"

needs_bash = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")


def _load(filename: str):
    spec = importlib.util.spec_from_file_location(
        filename.replace("-", "_").removesuffix(".py"), HERE / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def gen():
    return _load("gen-charmm-slurm-file.py")


def _run_bash(gen, tmp_path: Path, body: str) -> tuple[int, str]:
    status_file = tmp_path / "status.txt"
    status_file.write_text(STATUS)
    script = tmp_path / "run.sh"
    script.write_text(
        f'STATUS_FILE="{status_file}"\nWORKDIR="{tmp_path}"\n'
        + gen.add_helper_functions()
        + body
        + "\necho REACHED_END\n"
    )
    proc = subprocess.run(["bash", str(script)], capture_output=True, text=True)
    return proc.returncode, proc.stdout + status_file.read_text()


@needs_bash
def test_charmm_output_check_fails_on_a_file_charmm_could_not_open(gen, tmp_path):
    (tmp_path / "ok.out").write_text(" OPNLGU> Unit 99 opened for READONLY access\n")
    (tmp_path / "bad.out").write_text(
        " OPNLGU> Unit  99 cannot be opened as ../../CONST.INP\n"
    )

    code, out = _run_bash(
        gen, tmp_path, f"check_charmm_output minimize {tmp_path}/ok.out {tmp_path}/bad.out"
    )

    assert code == 1
    assert "REACHED_END" not in out
    assert re.search(r"^minimize: Error 1 \d+$", out, re.MULTILINE)


@needs_bash
def test_charmm_output_check_passes_clean_output(gen, tmp_path):
    (tmp_path / "ok.out").write_text(" OPNLGU> Unit 99 opened for READONLY access\n")

    code, out = _run_bash(gen, tmp_path, f"check_charmm_output minimize {tmp_path}/ok.out")

    assert code == 0
    assert "REACHED_END" in out


@pytest.mark.parametrize(
    "section, step, output",
    [
        ("generate_minimize_section", "minimize", "$WORKDIR/charmm/minimize/minimize.out"),
        ("generate_heat_section", "heat", "$WORKDIR/charmm/heat/heat.out"),
        ("generate_meld_all_chains_section", "meld", "$WORKDIR/pdb2crd_charmm_meld.out"),
    ],
)
def test_single_charmm_steps_check_their_output(gen, section, step, output):
    text = getattr(gen, section)({"num_cores": 4})

    assert f"check_charmm_output {step} {output}" in text
    assert text.index(f"check_charmm_output {step}") < text.index(
        f"update_status {step} Success"
    )


def test_meld_fails_on_a_charmm_error(gen):
    text = gen.generate_meld_all_chains_section({"num_cores": 4})

    assert "MELD_EXIT=$?\ncheck_exit_code $MELD_EXIT meld" in text


def test_md_and_dcd2pdb_check_every_output(gen):
    params = {"charmm_parameters": {"md": {"rgyr": [22, 31], "nsteps": 200000}}}
    md = gen.generate_md_section({"num_cores": 128}, params)
    dcd2pdb = gen.generate_dcd2pdb_section({"num_cores": 128}, params)

    assert "check_charmm_output md $WORKDIR/charmm/md/dynamics_rg*.out" in md
    assert "check_charmm_output dcd2pdb $WORKDIR/dcd2pdb_rg*.out" in dcd2pdb


@needs_bash
def test_remediation_fails_when_dcd2pdb_produced_no_pdbs(gen, tmp_path):
    (tmp_path / "foxs" / "rg22_run1").mkdir(parents=True)

    code, out = _run_bash(gen, tmp_path, gen.generate_pdb_remediate_section({}))

    assert code == 1
    assert "REACHED_END" not in out
    assert re.search(r"^pdb_remediate: Error \d+ \d+$", out, re.MULTILINE)


# --- run-foxs-after-charmm.py -------------------------------------------------

FAKE_FOXS = """#!/bin/bash
# Fails for PDB files with "bad" in the name, else writes the profile
case "$2" in
  *bad*) exit 1 ;;
  *) touch "$2.dat" ;;
esac
"""


@pytest.fixture
def foxs_dir(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "foxs").write_text(FAKE_FOXS)
    (bin_dir / "foxs").chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}:{os.environ['PATH']}")

    foxs = tmp_path / "work" / "foxs"
    foxs.mkdir(parents=True)
    monkeypatch.chdir(foxs)
    return foxs


def _add_pdbs(foxs: Path, run_dir: str, names: list[str]) -> None:
    (foxs / run_dir).mkdir()
    for name in names:
        (foxs / run_dir / name).touch()


@needs_bash
def test_foxs_succeeds_when_some_conformers_fail(foxs_dir):
    _add_pdbs(foxs_dir, "rg22_run1", ["a_1.pdb", "a_2.pdb", "bad_3.pdb"])

    assert _load("run-foxs-after-charmm.py").main() == 0


@needs_bash
def test_foxs_fails_when_every_conformer_fails(foxs_dir):
    _add_pdbs(foxs_dir, "rg22_run1", ["bad_1.pdb", "bad_2.pdb"])

    assert _load("run-foxs-after-charmm.py").main() == 1


def test_foxs_fails_without_run_directories(foxs_dir):
    assert _load("run-foxs-after-charmm.py").main() == 1


def test_foxs_fails_when_run_directories_have_no_pdbs(foxs_dir):
    (foxs_dir / "rg22_run1").mkdir()

    assert _load("run-foxs-after-charmm.py").main() == 1
