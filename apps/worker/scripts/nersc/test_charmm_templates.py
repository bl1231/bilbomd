"""Tests that the NERSC CHARMM input files point at files that will exist.

gen-charmm-slurm-file.py fills the templates in bilbomd-templates/. minimize,
heat and md run in charmm/<step>/, but pdb2crd writes the psf/crd and
pae2const writes const.inp in the workdir. dcd2pdb runs in the workdir and
reads the dcd files that md writes in charmm/md/. A wrong relative path only
shows up as a CHARMM failure on Perlmutter.
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

import pytest

HERE = Path(__file__).parent
TEMPLATES = ["minimize.tmpl", "heat.tmpl", "dynamics.tmpl", "dcd2pdb.tmpl"]
RG_VALUES = [22, 31]
RUNS = 2

# CRD jobs upload their own psf/crd/constraint files (names as in real jobs).
# Auto jobs get them from pdb2crd and pae2const during the Slurm job.
CRD_UPLOADS = {
    "psf_file": "example.psf",
    "crd_file": "example.crd",
    "const_inp_file": "example-const.inp",
}
GENERATED_INPUTS = ["bilbomd_pdb2crd.psf", "bilbomd_pdb2crd.crd", "const.inp"]
# Files that earlier CHARMM steps write before the next step reads them
STEP_OUTPUTS = [
    "charmm/minimize/minimization_output.crd",
    "charmm/heat/heat_output.crd",
    "charmm/heat/heat_output.rst",
]

READ_RE = re.compile(r"^open read unit \d+ card name (\S+)", re.MULTILINE)
STREAM_RE = re.compile(r"^STREAM (\S+)", re.MULTILINE)
DCD_READ_RE = re.compile(r"^open unit 50 read unform name (\S+)", re.MULTILINE)
DCD_WRITE_RE = re.compile(r"^open write unit 32 file name (\S+)", re.MULTILINE)


def _load():
    spec = importlib.util.spec_from_file_location(
        "gen_charmm_slurm_file", HERE / "gen-charmm-slurm-file.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _render(tmp_path: Path, params: dict, uploads: list[str]) -> Path:
    module = _load()
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    (upload_dir / "params.json").write_text(json.dumps(params))
    for name in uploads:
        (upload_dir / name).touch()

    workdir = tmp_path / "job"
    config = module.setup_environment("uuid")
    config["workdir"] = str(workdir)
    params = module.prepare_input(str(workdir), str(upload_dir))

    module.copy_template_files(config)
    module.template_minimization_file(config, params)
    module.template_heat_file(config, params)
    module.template_md_files(config, params)
    module.template_dcd2pdb_input_files(config, params)
    return workdir


def _md_params(job_type: str, **extra) -> dict:
    return {
        "__t": job_type,
        "charmm_parameters": {"md": {"rgyr": RG_VALUES, "nsteps": RUNS * 100000}},
        **extra,
    }


@pytest.fixture(params=["BilboMdCRD", "BilboMdAuto"])
def workdir(request, tmp_path):
    if request.param == "BilboMdCRD":
        workdir = _render(
            tmp_path, _md_params("BilboMdCRD", **CRD_UPLOADS), list(CRD_UPLOADS.values())
        )
    else:
        workdir = _render(tmp_path, _md_params("BilboMdAuto"), [])
        for name in GENERATED_INPUTS:
            (workdir / name).touch()

    for name in STEP_OUTPUTS:
        (workdir / name).touch()
    return workdir


def _step_inputs(workdir: Path) -> list[Path]:
    return [
        workdir / "charmm" / "minimize" / "minimize.inp",
        workdir / "charmm" / "heat" / "heat.inp",
        *(workdir / "charmm" / "md" / f"dynamics_rg{rg}.inp" for rg in RG_VALUES),
    ]


def test_templates_ship_next_to_the_generator():
    config = _load().setup_environment("uuid")

    assert Path(config["template_dir"]) == HERE / "bilbomd-templates"
    for name in TEMPLATES:
        assert (HERE / "bilbomd-templates" / name).is_file()


def test_sync_script_copies_the_templates_to_cfs():
    script = (HERE / "sync-nersc-scripts-to-cfs.sh").read_text()

    assert '"${SRC}/bilbomd-templates/" "${DEST}/bilbomd-templates/"' in script


def test_step_inputs_resolve_from_their_step_directory(workdir):
    for inp in _step_inputs(workdir):
        content = inp.read_text()
        paths = READ_RE.findall(content) + STREAM_RE.findall(content)
        # Skip the topology (absolute) and restart files the md loop writes
        # for its own next iteration (@ii)
        relative = [p for p in paths if not p.startswith("/") and "@" not in p]

        assert relative, inp
        for path in relative:
            assert (inp.parent / path).resolve().is_file(), f"{inp.name}: {path}"


def test_dcd2pdb_reads_the_dcd_files_that_md_writes(workdir):
    written = set()
    for rg in RG_VALUES:
        content = (workdir / "charmm" / "md" / f"dynamics_rg{rg}.inp").read_text()
        (pattern,) = DCD_WRITE_RE.findall(content)
        written |= {
            f"charmm/md/{pattern.replace('@ii', str(run))}"
            for run in range(1, RUNS + 1)
        }

    read = set()
    for rg in RG_VALUES:
        for run in range(1, RUNS + 1):
            content = (workdir / f"dcd2pdb_rg{rg}_run{run}.inp").read_text()
            read |= set(DCD_READ_RE.findall(content))
            (psf,) = READ_RE.findall(content)
            assert (workdir / psf).is_file()

    assert read == written
    assert len(read) == len(RG_VALUES) * RUNS


def test_crd_jobs_stream_the_uploaded_constraint_file(tmp_path):
    workdir = _render(
        tmp_path, _md_params("BilboMdCRD", **CRD_UPLOADS), list(CRD_UPLOADS.values())
    )

    for inp in _step_inputs(workdir)[1:]:
        assert "STREAM ../../example-const.inp" in inp.read_text().splitlines(), inp


@pytest.mark.parametrize("const_inp_file", [None, "missing.inp"])
def test_crd_job_without_its_constraint_file_fails_at_prep(tmp_path, const_inp_file):
    # CHARMM only warns on a STREAM it cannot open, so a bad name would run
    # heat and md without constraints and still report Success
    uploads = {**CRD_UPLOADS, "const_inp_file": const_inp_file}

    with pytest.raises(SystemExit):
        _render(
            tmp_path,
            _md_params("BilboMdCRD", **uploads),
            [CRD_UPLOADS["psf_file"], CRD_UPLOADS["crd_file"]],
        )


def test_dcd2pdb_tolerates_charmm_warnings():
    # Matches the beamline dcd2pdb (#640): bomlev 0 aborts on the CGenFF NBFIX
    # warning that ligand-containing systems raise.
    content = (HERE / "bilbomd-templates" / "dcd2pdb.tmpl").read_text()

    assert re.search(r"^bomlev -2$", content, re.MULTILINE)


def _runs_rendered(workdir: Path) -> set[int]:
    """Runs per Rg, as rendered into the MD loop and the dcd2pdb inputs."""
    loops = {
        int(float(m)) for m in re.findall(
            r"^if ii lt ([\d.]+) goto loop$",
            "\n".join(p.read_text() for p in (workdir / "charmm" / "md").glob("*.inp")),
            re.MULTILINE,
        )
    }
    dcd2pdb = {
        len(list(workdir.glob(f"dcd2pdb_rg{rg}_run*.inp"))) for rg in RG_VALUES
    }
    return loops | dcd2pdb


@pytest.mark.parametrize(
    "extra, runs",
    [
        # nsteps sent explicitly and disagreeing: the beamline follows
        # conformational_sampling
        ({"conformational_sampling": 2, "nsteps": 300000}, 2),
        ({"conformational_sampling": 4, "nsteps": 100000}, 4),
        # older jobs without conformational_sampling fall back to nsteps
        ({"nsteps": 300000}, 3),
    ],
)
def test_runs_per_rg_follow_conformational_sampling(tmp_path, extra, runs):
    nsteps = extra.pop("nsteps")
    params = _md_params("BilboMdCRD", **CRD_UPLOADS, **extra)
    params["charmm_parameters"]["md"]["nsteps"] = nsteps

    workdir = _render(tmp_path, params, list(CRD_UPLOADS.values()))
    section = _load().generate_dcd2pdb_section({"num_cores": 128}, params)

    assert _runs_rendered(workdir) == {runs}
    assert f"Processing {len(RG_VALUES) * runs} DCD2PDB jobs" in section
