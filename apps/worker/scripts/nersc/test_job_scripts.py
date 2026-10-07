"""Tests that NERSC jobs run scripts that deploy with the worker.

The generators call every helper and MD script from the job's own copy in
/bilbomd/work/.scripts, built from job-scripts.txt by
sync-nersc-scripts-to-cfs.sh, instead of the copies baked into the
Perlmutter images. A script missing from that list would only fail on
Perlmutter, so these tests run the real sync script against a copy of the
image's /app/scripts layout and check what it produces.
"""

from __future__ import annotations

import ast
import importlib.util
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).parent
REPO = HERE.parents[3]
# The worker image's /app/scripts is apps/worker/scripts plus tools/python
IMAGE_SOURCES = [REPO / "apps/worker/scripts", REPO / "tools/python"]
GENERATORS = ["gen-openmm-slurm-file.py", "gen-charmm-slurm-file.py"]
JOB_PATH_RE = re.compile(r"/bilbomd/work/\.scripts/([\w./-]+\.py)")

needs_rsync = pytest.mark.skipif(shutil.which("rsync") is None, reason="needs rsync")


def _manifest() -> list[str]:
    lines = (HERE / "job-scripts.txt").read_text().splitlines()
    return [ln.strip() for ln in lines if ln.strip() and not ln.startswith("#")]


def _load(filename: str):
    spec = importlib.util.spec_from_file_location(
        filename.replace("-", "_").removesuffix(".py"), HERE / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def bundle(tmp_path_factory) -> Path:
    """Run the real sync script on an image-like /app/scripts tree."""
    if shutil.which("rsync") is None:
        pytest.skip("needs rsync")
    tmp = tmp_path_factory.mktemp("sync")
    app_scripts = tmp / "app-scripts"
    for src in IMAGE_SOURCES:
        shutil.copytree(src, app_scripts, dirs_exist_ok=True)
    dest = tmp / "cfs-scripts"
    dest.mkdir()
    subprocess.run(
        ["bash", str(HERE / "sync-nersc-scripts-to-cfs.sh")],
        env={**os.environ, "SCRIPTS_ROOT": str(app_scripts), "DEST": str(dest)},
        check=True,
        capture_output=True,
    )
    return dest / "job-scripts"


def test_every_manifest_entry_exists_in_the_image_layout():
    for entry in _manifest():
        assert any((src / entry).exists() for src in IMAGE_SOURCES), entry


@pytest.mark.parametrize("filename", GENERATORS)
def test_generators_only_run_scripts_from_the_job_copy(filename):
    source = (HERE / filename).read_text()
    # The CHARMM stream file points at toppar inside the image, so it stays
    image_paths = set(re.findall(r"/app/scripts/[\w./-]+", source))
    assert image_paths <= {"/app/scripts/bilbomd_top_par_files.str"}
    assert JOB_PATH_RE.search(source)


@needs_rsync
@pytest.mark.parametrize("filename", GENERATORS)
def test_every_script_the_generators_run_is_synced(filename, bundle):
    called = set(JOB_PATH_RE.findall((HERE / filename).read_text()))

    missing = sorted(p for p in called if not (bundle / p).is_file())
    assert not missing, f"{filename} runs scripts missing from job-scripts.txt"


@needs_rsync
def test_local_imports_inside_the_bundle_resolve(bundle):
    # Each script runs with its own directory first on sys.path, so a module
    # it imports from the image layout must sit beside it in the bundle too.
    image_root = bundle.parent.parent / "app-scripts"
    for script in bundle.rglob("*.py"):
        rel_dir = script.parent.relative_to(bundle)
        tree = ast.parse(script.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
                names = [node.module]
            else:
                continue
            for name in names:
                top = name.split(".")[0]
                local = image_root / rel_dir / top
                if local.with_suffix(".py").exists() or local.is_dir():
                    target = bundle / rel_dir / top
                    assert target.with_suffix(".py").exists() or target.is_dir(), (
                        f"{script.relative_to(bundle)} imports {name}, "
                        "which is not in job-scripts.txt"
                    )


@needs_rsync
def test_bundle_has_no_tests_or_caches(bundle):
    junk = [
        p.relative_to(bundle)
        for p in bundle.rglob("*")
        if p.name.startswith("test_")
        or p.name in {"conftest.py", "__pycache__", ".pytest_cache"}
    ]
    assert not junk


@needs_rsync
def test_sync_replaces_the_previous_bundle(bundle, tmp_path):
    # A script dropped from the list must not linger on CFS
    stale = bundle / "nersc" / "removed-script.py"
    stale.write_text("")
    app_scripts = bundle.parent.parent / "app-scripts"
    subprocess.run(
        ["bash", str(HERE / "sync-nersc-scripts-to-cfs.sh")],
        env={**os.environ, "SCRIPTS_ROOT": str(app_scripts), "DEST": str(bundle.parent)},
        check=True,
        capture_output=True,
    )
    assert not stale.exists()
    assert not (bundle.parent / "job-scripts.new").exists()
    assert not (bundle.parent / "job-scripts.old").exists()


@needs_rsync
@pytest.mark.parametrize("filename", GENERATORS)
def test_generators_snapshot_the_bundle_into_the_workdir(filename, bundle, tmp_path):
    workdir = tmp_path / "job"
    (workdir / ".scripts").mkdir(parents=True)
    (workdir / ".scripts" / "left-over.py").write_text("")

    _load(filename).copy_job_scripts(str(workdir), src=bundle)

    assert (workdir / ".scripts" / "nersc" / "run-multifoxs.py").is_file()
    assert (workdir / ".scripts" / "openmm" / "md.py").is_file()
    assert not (workdir / ".scripts" / "left-over.py").exists()


@pytest.mark.parametrize("filename", GENERATORS)
def test_missing_bundle_fails_the_prep(filename, tmp_path):
    with pytest.raises(FileNotFoundError):
        _load(filename).copy_job_scripts(str(tmp_path), src=tmp_path / "nope")
