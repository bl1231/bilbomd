import argparse
import json
from unittest.mock import MagicMock, patch

import pytest

from scripts.autorg import calculate_rg, parse_args

# Sample data for testing
SAMPLE_PROFILE = MagicMock()
SAMPLE_GUINIER_RESULTS = (
    10.0,  # rg
    100.0,  # izero
    0.5,  # rg_err
    5.0,  # izero_err
    0.01,  # qmin
    0.1,  # qmax
    0.8,  # qrg_min
    1.5,  # qrg_max
    1,  # idx_min
    10,  # idx_max
    0.99,  # r_sqr
)


@pytest.fixture
def mock_raw():
    with patch("autorg.raw") as patched_raw:
        patched_raw.load_profiles.return_value = [SAMPLE_PROFILE]
        patched_raw.auto_guinier.return_value = SAMPLE_GUINIER_RESULTS
        yield patched_raw


def test_parse_args():
    test_args = ["test_file.dat"]
    with patch("argparse._sys.argv", ["autorg.py"] + test_args):
        args = parse_args()
        assert args.file_path == "test_file.dat"


def test_parse_args_no_args():
    # Simulate passing no arguments
    with patch("argparse._sys.argv", ["autorg.py"]), pytest.raises(SystemExit):
        parse_args()


def test_calculate_rg():
    # Mock the load_profiles and auto_guinier functions from raw
    with patch("scripts.autorg.raw.load_profiles") as mock_load_profiles, patch(
        "scripts.autorg.raw.auto_guinier"
    ) as mock_auto_guinier:

        # Simulate the profile and guinier results
        mock_load_profiles.return_value = ["mock_profile"]
        mock_auto_guinier.return_value = (5.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

        # Capture the printed JSON output
        with patch("builtins.print") as mock_print:
            calculate_rg("mock_file_path")

            # Check if the expected result was printed
            expected_result = json.dumps({"rg": 5, "rg_min": 4, "rg_max": 8})
            mock_print.assert_called_once_with(expected_result)


def test_calculate_rg_edge_case():
    with patch("scripts.autorg.raw.load_profiles") as mock_load_profiles, patch(
        "scripts.autorg.raw.auto_guinier"
    ) as mock_auto_guinier:

        # Simulate a very low Rg value
        mock_load_profiles.return_value = ["mock_profile"]
        mock_auto_guinier.return_value = (0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

        # Capture the printed JSON output
        with patch("builtins.print") as mock_print:
            calculate_rg("mock_file_path")

            # Check if the expected result was printed
            expected_result = json.dumps({"rg": 0, "rg_min": 0, "rg_max": 0})
            mock_print.assert_called_once_with(expected_result)
