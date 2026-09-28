"""Tests that the NERSC Slurm generators only update steps listed in status.txt.

The generated script updates status.txt with
`sed -i "s/^$step: .*/$step: $status/"`. A step name with no line in the
file matches nothing and fails silently, so the step keeps its old status
in the UI. For example, `update_status pae2 Success` left the PAE step
"Running" forever on NERSC OpenMM jobs.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

HERE = Path(__file__).parent

PIPELINE_TYPES = ["BilboMdAlphaFold", "BilboMdAuto", "BilboMdPDB", "BilboMdCRD"]

# Steps updated in a section that main() never adds to the script.
UNUSED_SECTION_STEPS = {"gen-charmm-slurm-file.py": {"copy2cfs"}}

UPDATE_STATUS_RE = re.compile(r"update_status ([A-Za-z_]\w*) ")


def _load(filename: str):
    spec = importlib.util.spec_from_file_location(
        filename.replace("-", "_").removesuffix(".py"), HERE / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _status_steps(module, pipeline_type: str, tmp_path: Path) -> set[str]:
    workdir = tmp_path / pipeline_type
    workdir.mkdir()
    module.create_status_file(str(workdir), {"__t": pipeline_type})
    lines = (workdir / "status.txt").read_text().splitlines()
    return {line.split(":", 1)[0] for line in lines}


GENERATORS = ["gen-openmm-slurm-file.py", "gen-charmm-slurm-file.py"]


@pytest.mark.parametrize("filename", GENERATORS)
def test_every_updated_step_is_in_status_file(filename, tmp_path):
    module = _load(filename)
    known = set().union(
        *(_status_steps(module, t, tmp_path) for t in PIPELINE_TYPES)
    )
    source = (HERE / filename).read_text()
    updated = set(UPDATE_STATUS_RE.findall(source))
    unknown = updated - known - UNUSED_SECTION_STEPS.get(filename, set())
    assert not unknown, (
        f"{filename} updates steps missing from status.txt: {sorted(unknown)}"
    )


@pytest.mark.parametrize("filename", GENERATORS)
@pytest.mark.parametrize("pipeline_type", ["BilboMdAlphaFold", "BilboMdAuto"])
def test_pae_section_completes_the_pae_step(filename, pipeline_type, tmp_path):
    module = _load(filename)
    section = module.generate_pae2const_section({"num_cores": 4}, {})
    steps = _status_steps(module, pipeline_type, tmp_path)

    assert "update_status pae Running" in section
    assert "update_status pae Success" in section
    assert "update_status pae Error" in section
    assert set(UPDATE_STATUS_RE.findall(section)) <= steps
