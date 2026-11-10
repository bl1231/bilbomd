"""Tests for utils.md_errors (stdlib only — no OpenMM needed)."""

import pytest
from utils.md_errors import UNSTABLE_MARKER, is_nan_error, unstable_message


@pytest.mark.parametrize(
    "exc",
    [
        Exception("Particle coordinate is NaN.  For more information, see https://..."),
        ValueError("Particle position is NaN.  For more information, see https://..."),
        RuntimeError("Energy is NaN"),
        RuntimeError("energy is nan"),
    ],
)
def test_is_nan_error_matches_openmm_nan_messages(exc):
    assert is_nan_error(exc)


@pytest.mark.parametrize(
    "exc",
    [
        ValueError("could not convert string to float: 'abc'"),
        RuntimeError("No compatible CUDA device is available"),
        FileNotFoundError("heated.xml"),
        # "nan" inside another word must not match
        RuntimeError("cannot open file nanodisc.pdb"),
    ],
)
def test_is_nan_error_ignores_other_failures(exc):
    assert not is_nan_error(exc)


def test_unstable_message_carries_marker_rg_and_cause():
    msg = unstable_message(82.0, ValueError("Particle position is NaN."))
    assert msg.startswith(UNSTABLE_MARKER)
    assert "rg=82 " in msg
    assert "Particle position is NaN." in msg
    assert "\n" not in msg
