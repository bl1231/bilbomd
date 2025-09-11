# tests/test_imports.py
import pytest
from scripts.pae_ratios import (
    get_first_and_last_residue_numbers,
    # define_segments,
    # correct_json_brackets,
    define_clusters_for_selected_pae,
    is_float,
    # sort_and_separate_cluster,
    find_and_update_sequential_rigid_domains,
    # calculate_bfactor_avg_for_region,
    # identify_new_rigid_domain,
    # define_rigid_bodies,
    write_const_file,
)

# Sample data for testing
CRD_FILE_CONTENT = """
* Comment line
* Another comment line
EXT
ATOM      1  N   MET A   1      11.104  13.207  10.000  1.00 50.00           N
ATOM      2  CA  MET A   2      12.104  14.207  11.000  1.00 60.00           C
ATOM      3  C   MET A   3      13.104  15.207  12.000  1.00 70.00           C
ATOM      4  O   MET A   4      14.104  16.207  13.000  1.00 80.00           O
ATOM      5  CB  MET A   5      15.104  17.207  14.000  1.00 90.00           C
"""

PAE_FILE_CONTENT = """
{
    "predicted_aligned_error": [
        [0.0, 15.0, 20.0],
        [15.0, 0.0, 25.0],
        [20.0, 25.0, 0.0]
    ]
}
"""


@pytest.fixture
def crd_file(tmp_path):
    crd_file_path = tmp_path / "test.crd"
    crd_file_path.write_text(CRD_FILE_CONTENT)
    return str(crd_file_path)


@pytest.fixture
def pae_file(tmp_path):
    pae_file_path = tmp_path / "test.pae"
    pae_file_path.write_text(PAE_FILE_CONTENT)
    return str(pae_file_path)


def test_imports():
    try:
        import argparse
        import json
        from collections import defaultdict
        from typing import Tuple, Optional
        import igraph
        import numpy as np
    except ImportError as e:
        pytest.fail(f"Import failed: {e}")


def test_get_first_and_last_residue_numbers(crd_file):
    first_resnum, last_resnum = get_first_and_last_residue_numbers(crd_file)
    assert first_resnum == 1
    assert last_resnum == 5


# def test_define_segments(crd_file):
#     segments = define_segments(crd_file)
#     assert segments == [1, 2, 3, 4]


# def test_correct_json_brackets(pae_file, tmp_path):
#     output_file_path = tmp_path / "corrected.json"
#     correct_json_brackets(pae_file, str(output_file_path))
#     with open(output_file_path, "r") as f:
#         content = f.read()
#     assert (
#         content
#         == '{"predicted_aligned_error": [[0.0, 15.0, 20.0], [15.0, 0.0, 25.0], [20.0, 25.0, 0.0]]}'
#     )


def test_define_clusters_for_selected_pae(pae_file):
    clusters = define_clusters_for_selected_pae(pae_file, 0, 2, 0, 2)
    assert len(clusters) > 0


def test_is_float():
    assert is_float("3.14")
    assert not is_float("abc")
    assert not is_float(None)


# def test_sort_and_separate_cluster():
#     result = sort_and_separate_cluster([1, 2, 3, 7, 8, 9, 11], [3, 8])
#     assert result == [[1, 2], [3], [7], [8, 9], [11]]


def test_find_and_update_sequential_rigid_domains():
    lists_of_tuples = [[(10, 20, "A"), (21, 30, "A")], [(5, 15, "B"), (16, 25, "B")]]
    updated, result = find_and_update_sequential_rigid_domains(lists_of_tuples)
    assert updated
    assert result == [[(10, 19, "A"), (22, 30, "A")], [(5, 14, "B"), (17, 25, "B")]]


# def test_calculate_bfactor_avg_for_region(crd_file):
#     avg_bfactor = calculate_bfactor_avg_for_region(crd_file, 1, 5, 0)
#     assert avg_bfactor == 70.0


# def test_identify_new_rigid_domain(crd_file):
#     result = identify_new_rigid_domain(crd_file, 1, 5, 0)
#     assert result == (50, 90, "A")


# def test_define_rigid_bodies(crd_file):
#     clusters = [[1, 2, 3, 4, 5]]
#     chain_segments = [3]
#     result = define_rigid_bodies(clusters, crd_file, 0, chain_segments)
#     assert len(result) > 0


def test_write_const_file(tmp_path):
    rigid_body_list = [[(1, 2, "A"), (3, 4, "A")], [(5, 6, "B")]]
    output_file = tmp_path / "const.inp"
    write_const_file(rigid_body_list, str(output_file))
    with open(output_file, "r") as f:
        content = f.read()
    assert "define fixed1 sele ( resid 1:2 .and. segid A ) end" in content
    assert "define rigid1 sele ( resid 5:6 .and. segid B ) end" in content
