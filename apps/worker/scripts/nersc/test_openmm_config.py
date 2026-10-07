"""Tests for the openmm_config.yaml written by the NERSC OpenMM Slurm generator.

The generator has to make the same force-field and constraint choices as the
local worker (prepareOpenMMConfig in openmm-functions.ts). When it did not,
glycoproteins failed in minimize on Perlmutter and uploaded constraints were
silently dropped.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")
pytest.importorskip("numpy")

HERE = Path(__file__).parent
REPO_ROOT = HERE.parents[3]

PROTEIN_ATOM = "ATOM      1  CA  ALA A   1      11.104   6.134  -6.504  1.00  0.00           C"
NAG_ATOM = "HETATM 3201  C1  NAG A 501      21.104  16.134  -6.504  1.00  0.00           C"
SEP_ATOM = "ATOM    101  CA  SEP A  14      15.104   9.134  -2.504  1.00  0.00           C"

CONST_YAML = """constraints:
  fixed_bodies:
    - name: FixedBody1
      segments:
        - chain_id: A
          residues:
            start: 12
            stop: 226
  rigid_bodies: []
"""

CONST_INP = """define fixed1 sele ( resid 12:226 .and. segid PROA ) end
cons fix sele fixed1 end

return
"""

FIXED_BODY_A = {
    "name": "FixedBody1",
    "segments": [{"chain_id": "A", "residues": {"start": 12, "stop": 226}}],
}


def _load():
    spec = importlib.util.spec_from_file_location(
        "gen_openmm_slurm_file", HERE / "gen-openmm-slurm-file.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gen = _load()


def _config(tmp_path: Path, params: dict, pdb_lines: list[str] | None = None) -> dict:
    params = {"rg_min": 20, "rg_max": 40, **params}
    if pdb_lines is not None:
        (tmp_path / params["pdb_file"]).write_text("\n".join(pdb_lines) + "\n")
    path = gen.prepare_openmm_config(
        {"workdir": str(tmp_path), "gpus_per_node": 4}, params
    )
    return yaml.safe_load(Path(path).read_text())


def test_carbohydrate_residues_match_the_typescript_list():
    source = (REPO_ROOT / "packages/bilbomd-types/src/pdbResidues.ts").read_text()
    block = re.search(
        r"CARBOHYDRATE_RESIDUES = new Set<string>\(\[(.*?)\]\)", source, re.DOTALL
    )
    assert block, "CARBOHYDRATE_RESIDUES not found in pdbResidues.ts"
    assert gen.CARBOHYDRATE_RESIDUES == set(re.findall(r"'(\w+)'", block.group(1)))


def test_known_ions_match_prep_pdb():
    source = (HERE.parent / "prep_pdb.py").read_text()
    block = re.search(r"KNOWN_IONS = frozenset\(\[(.*?)\]\)", source, re.DOTALL)
    assert block, "KNOWN_IONS not found in prep_pdb.py"
    assert gen.KNOWN_IONS == set(re.findall(r'"(\w+)"', block.group(1)))


def test_waters_and_ions_are_removed_from_the_pdb(tmp_path):
    water = "HETATM 4001  O   HOH A 601      31.104  26.134  -6.504  1.00  0.00           O"
    zinc = "HETATM 4002 ZN    ZN A 602      32.104  27.134  -6.504  1.00  0.00          ZN"
    _config(tmp_path, {"pdb_file": "in.pdb"}, [PROTEIN_ATOM, NAG_ATOM, water, zinc, "END"])

    assert (tmp_path / "in.pdb").read_text().splitlines() == [PROTEIN_ATOM, NAG_ATOM, "END"]


def test_plain_protein_uses_amber19(tmp_path):
    cfg = _config(tmp_path, {"pdb_file": "in.pdb"}, [PROTEIN_ATOM])

    assert cfg["input"]["forcefield"] == ["amber19-all.xml", "implicit/gbn2.xml"]
    assert cfg["input"]["has_carbohydrates"] is False
    assert cfg["input"]["has_charmm36_residues"] is False


def test_glycoprotein_uses_glycam(tmp_path):
    cfg = _config(tmp_path, {"pdb_file": "in.pdb"}, [PROTEIN_ATOM, NAG_ATOM])

    assert cfg["input"]["forcefield"] == [
        "amber19-all.xml",
        "amber14/GLYCAM_06j-1.xml",
        "implicit/gbn2.xml",
    ]
    assert cfg["input"]["has_carbohydrates"] is True


def test_phosphorylated_protein_uses_charmm36(tmp_path):
    cfg = _config(tmp_path, {"pdb_file": "in.pdb"}, [PROTEIN_ATOM, SEP_ATOM])

    assert cfg["input"]["forcefield"] == ["charmm36_2024.xml", "implicit/gbn2.xml"]
    assert cfg["input"]["has_charmm36_residues"] is True
    assert cfg["input"]["has_carbohydrates"] is False


def test_glycam_takes_priority_over_charmm36(tmp_path):
    cfg = _config(tmp_path, {"pdb_file": "in.pdb"}, [PROTEIN_ATOM, SEP_ATOM, NAG_ATOM])

    assert "amber14/GLYCAM_06j-1.xml" in cfg["input"]["forcefield"]
    assert cfg["input"]["has_carbohydrates"] is True
    assert cfg["input"]["has_charmm36_residues"] is True


def test_missing_pdb_falls_back_to_amber19(tmp_path):
    # AlphaFold jobs: the model does not exist until the Slurm job has run
    cfg = _config(tmp_path, {})

    assert cfg["input"]["forcefield"] == ["amber19-all.xml", "implicit/gbn2.xml"]


def test_constraints_come_from_openmm_const_yml(tmp_path):
    (tmp_path / "openmm_const.yml").write_text(CONST_YAML)
    cfg = _config(tmp_path, {"pdb_file": "in.pdb", "const_inp_file": "openmm_const.yml"})

    assert cfg["constraints"] == {"fixed_bodies": [FIXED_BODY_A], "rigid_bodies": []}


def test_flat_openmm_const_yml_is_accepted(tmp_path):
    flat = yaml.safe_dump(yaml.safe_load(CONST_YAML)["constraints"])
    (tmp_path / "openmm_const.yml").write_text(flat)
    cfg = _config(tmp_path, {"pdb_file": "in.pdb"})

    assert cfg["constraints"]["fixed_bodies"] == [FIXED_BODY_A]


def test_constraints_come_from_the_named_inp_file(tmp_path):
    (tmp_path / "fab2f1const.inp").write_text(CONST_INP)
    cfg = _config(tmp_path, {"pdb_file": "in.pdb", "const_inp_file": "fab2f1const.inp"})

    assert cfg["constraints"]["fixed_bodies"] == [FIXED_BODY_A]


def test_no_constraint_file_gives_empty_constraints(tmp_path):
    cfg = _config(tmp_path, {"pdb_file": "in.pdb"})

    assert cfg["constraints"] == {"fixed_bodies": [], "rigid_bodies": []}


@pytest.mark.parametrize("filename", ["gen-openmm-slurm-file.py", "gen-charmm-slurm-file.py"])
def test_failed_steps_do_not_cancel_the_slurm_job(filename):
    # scancel makes Slurm record CANCELLED, which BilboMD reports as a user
    # cancellation: no failure email and a job_cancelled usage event.
    source = (HERE / filename).read_text()
    commands = [line.strip() for line in source.splitlines() if not line.lstrip().startswith("#")]
    assert not [line for line in commands if line.startswith("scancel")]


def test_rg_plot_failure_does_not_fail_the_job():
    # The plot is not used by the results step, and plot_rgyrs.py runs from a
    # separately built image that can lag the CSV format written by rgyr.py.
    section = gen.generate_analysis_section({"num_cores": 4, "workdir": "/w"})
    assert "check_exit_code $ANALYSIS_EXIT" not in section
    assert "update_status analysis Error" in section
    assert "update_status analysis Success" in section


def test_rg_plot_reads_the_column_rgyr_writes():
    rgyr = (HERE.parent / "openmm" / "utils" / "rgyr.py").read_text()
    plot = (HERE.parent / "openmm" / "plot_rgyrs.py").read_text()
    assert '"Step", "Rgyr_A", "Dmax_A"' in rgyr
    assert 'df["Rgyr_A"]' in plot
    assert "Radius_of_Gyration_nm" not in plot


# --- MD parameters: same as the beamline (buildOpenMMConfigForJob) ---------------

# A real prod Auto job: the backend's calculateRgyrRange(26, 42)
JOB_RGYR = [26, 29, 32, 36, 39, 42]


def _md(cfg: dict) -> dict:
    return cfg["steps"]["md"]


def test_md_runs_the_jobs_rg_values_four_gpus_per_wave(tmp_path):
    params = {"openmm_parameters": {"md": {"rgyr": JOB_RGYR}}}

    rgyr = _md(_config(tmp_path, params))["rgyr"]

    assert rgyr["rg_sets"] == [[26, 29, 32, 36], [39, 42]]


def test_nested_rgyr_list_uses_its_first_set_like_the_beamline(tmp_path):
    params = {"openmm_parameters": {"md": {"rgyr": [JOB_RGYR, [50, 60]]}}}

    assert _md(_config(tmp_path, params))["rgyr"]["rg_sets"][0] == JOB_RGYR[:4]


def test_jobs_without_an_rgyr_list_rebuild_it_like_the_backend(tmp_path):
    cfg = _config(tmp_path, {"rg_min": 26, "rg_max": 42})

    assert sum(_md(cfg)["rgyr"]["rg_sets"], []) == JOB_RGYR


def test_k_rg_and_report_intervals_come_from_the_job(tmp_path):
    md = {"k_rg": 25, "rg_report_interval": 200, "pdb_report_interval": 1000}

    cfg = _config(tmp_path, {"openmm_parameters": {"md": {"rgyr": JOB_RGYR, **md}}})

    assert _md(cfg)["rgyr"]["k_rg"] == 25
    assert _md(cfg)["rgyr"]["report_interval"] == 200
    assert _md(cfg)["pdb_report_interval"] == 1000


def test_md_defaults_match_the_beamline(tmp_path):
    md = _md(_config(tmp_path, {"openmm_parameters": {"md": {"rgyr": JOB_RGYR}}}))

    assert md["rgyr"]["k_rg"] == 10
    assert md["rgyr"]["report_interval"] == 500
    assert md["pdb_report_interval"] == 500


def test_job_without_rg_values_fails_at_prep(tmp_path):
    with pytest.raises(SystemExit):
        gen.prepare_openmm_config(
            {"workdir": str(tmp_path), "gpus_per_node": 4}, {"pdb_file": "in.pdb"}
        )


def test_each_md_wave_gets_one_gpu_task_per_rg_value(tmp_path):
    _config(tmp_path, {"openmm_parameters": {"md": {"rgyr": JOB_RGYR}}})

    section = gen.generate_md_section(
        {"workdir": str(tmp_path), "num_cores": 128, "gpus_per_node": 4}
    )

    assert re.findall(r"srun --ntasks=(\d+)", section) == ["4", "2"]
    assert section.count("--cpus-per-task=32") == 2
    assert "--rg-set 0" in section and "--rg-set 1" in section
