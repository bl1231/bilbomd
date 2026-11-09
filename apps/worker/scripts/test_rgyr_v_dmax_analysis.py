"""Tests for the REMARK parsing in rgyr_v_dmax_analysis.py."""

from rgyr_v_dmax_analysis import collect_pdb_data, parse_pdb_file


def write_pdb(path, remark):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{remark}\nATOM      1  N   MET P   1      81.055  19.926  43.044  1.00  0.00\n")
    return path


def test_charmm_remark(tmp_path):
    pdb = write_pdb(tmp_path / "a.pdb", "REMARK DCD2PDB_RG26_RUN1_99500 26.3962348 77.2386343")
    assert parse_pdb_file(pdb) == ("DCD2PDB_RG26_RUN1_99500", 26.3962348, 77.2386343)


def test_bioemu_remark_uses_the_upper_cased_stem(tmp_path):
    pdb = write_pdb(tmp_path / "b.pdb", "REMARK DCD2PDB_RG bioemu_rg30_0007 29.812 101.626")
    assert parse_pdb_file(pdb) == ("BIOEMU_RG30_0007", 29.812, 101.626)


def test_unreadable_remark_is_skipped(tmp_path):
    pdb = write_pdb(tmp_path / "c.pdb", "REMARK DCD2PDB_RG30 not-a-number 77.2")
    assert parse_pdb_file(pdb) == (None, None, None)


def test_no_remark(tmp_path):
    pdb = write_pdb(tmp_path / "d.pdb", "REMARK   DATE:    11/ 6/26")
    assert parse_pdb_file(pdb) == (None, None, None)


def test_collect_pdb_data_keys_match_ensemble_lookup(tmp_path):
    write_pdb(tmp_path / "rg30" / "bioemu_rg30_0001.pdb", "REMARK DCD2PDB_RG bioemu_rg30_0001 29.8 101.6")
    write_pdb(tmp_path / "rg26_run1" / "dcd2pdb_rg26_run1_500.pdb", "REMARK DCD2PDB_RG26_RUN1_500 26.4 77.2")
    data = collect_pdb_data(str(tmp_path))
    assert data["BIOEMU_RG30_0001"] == {"rgyr": 29.8, "dmax": 101.6, "pdb": "BIOEMU_RG30_0001"}
    assert data["DCD2PDB_RG26_RUN1_500"]["dmax"] == 77.2
