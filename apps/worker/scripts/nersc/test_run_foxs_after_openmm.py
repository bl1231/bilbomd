"""Tests for when the NERSC OpenMM FoXS step fails the Slurm job.

The beamline (runFoXS in foxs-functions.ts) only fails when no conformer
got a profile, or when there is nothing to run. MultiFoXS only gets the
profiles that succeeded, so a few failed conformers are a warning.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).parent
SCRIPT = HERE / "run-foxs-after-openmm.py"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")

# Fails for PDB files containing BAD, else writes the profile
FAKE_FOXS = """#!/bin/bash
grep -q BAD "$2" && exit 1
touch "$2.dat"
"""


@pytest.fixture
def md_root(tmp_path: Path) -> Path:
    foxs = tmp_path / "foxs"
    foxs.write_text(FAKE_FOXS)
    foxs.chmod(0o755)
    root = tmp_path / "openmm" / "md"
    root.mkdir(parents=True)
    return root


def _add_frames(root: Path, rg_dir: str, names: list[str], bad=()) -> None:
    (root / rg_dir).mkdir()
    for name in names:
        (root / rg_dir / name).write_text("BAD\n" if name in bad else "ATOM\n")


def _run(root: Path) -> tuple[int, list[str]]:
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--root",
            str(root),
            "--foxs-cmd",
            str(root.parent.parent / "foxs"),
            "--workers",
            "2",
        ],
        capture_output=True,
        text=True,
    )
    manifest = root / "foxs_dat_files.txt"
    entries = manifest.read_text().split() if manifest.exists() else []
    return proc.returncode, sorted(entries)


def test_all_conformers_succeed(md_root):
    _add_frames(md_root, "rg_30", ["md_000000500.pdb", "md_000001000.pdb"])

    assert _run(md_root) == (
        0,
        ["rg_30/md_000000500.pdb.dat", "rg_30/md_000001000.pdb.dat"],
    )


def test_a_few_failed_conformers_only_warn(md_root):
    _add_frames(md_root, "rg_30", ["md_000000500.pdb", "md_000001000.pdb"])
    _add_frames(
        md_root, "rg_40", ["md_000000500.pdb", "md_000001000.pdb"],
        bad={"md_000001000.pdb"},
    )

    assert _run(md_root) == (
        0,
        [
            "rg_30/md_000000500.pdb.dat",
            "rg_30/md_000001000.pdb.dat",
            "rg_40/md_000000500.pdb.dat",
        ],
    )


def test_fails_when_every_conformer_fails(md_root):
    _add_frames(md_root, "rg_30", ["md_000000500.pdb"], bad={"md_000000500.pdb"})

    assert _run(md_root) == (1, [])


def test_fails_without_rg_directories(md_root):
    assert _run(md_root)[0] == 1


def test_fails_when_rg_directories_have_no_frames(md_root):
    _add_frames(md_root, "rg_30", ["md.pdb"])  # final frame only, not sampled

    assert _run(md_root)[0] == 1
