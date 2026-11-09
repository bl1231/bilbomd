"""Tests for the stdlib-only parameter handling of the BioEmu2 service."""

import json

import pytest
from params import DEFAULTS, Params, SamplingError, rg_label


def write(tmp_path, data):
    p = tmp_path / "params.json"
    p.write_text(data if isinstance(data, str) else json.dumps(data))
    return p


def test_defaults_are_the_phase0_steer_config(tmp_path):
    params = Params.load(write(tmp_path, {"rgs": [30, 34.5]}))
    assert params.rgs == [30.0, 34.5]
    assert params.num_samples_per_rg == 50
    assert params.batch_size == 40
    assert params.num_steps == 50
    assert params.num_gd_steps == 5
    assert params.default_potentials is True
    assert params.seed == DEFAULTS["seed"]


def test_overrides(tmp_path):
    params = Params.load(write(tmp_path, {"rgs": [40], "num_samples_per_rg": 10, "default_potentials": False}))
    assert params.num_samples_per_rg == 10
    assert params.default_potentials is False


def test_guidance_weight_scales_with_gd_steps(tmp_path):
    # 0.02 per GD step at 20 steps -> 0.08 at the default 5 steps (Phase 0 convention)
    assert Params.load(write(tmp_path, {"rgs": [30]})).guidance_weight() == pytest.approx(0.08)
    assert Params.load(write(tmp_path, {"rgs": [30], "num_gd_steps": 20})).guidance_weight() == pytest.approx(0.02)
    # 0 GD steps must not divide by zero
    assert Params.load(write(tmp_path, {"rgs": [30], "num_gd_steps": 0})).guidance_weight() == pytest.approx(0.4)


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"rgs": []},
        {"rgs": "30"},
        {"rgs": [30, -1]},
        {"rgs": [30, True]},
        {"rgs": [30], "num_samples_per_rg": 0},
        {"rgs": [30], "batch_size": "many"},
        {"rgs": [30], "num_gd_steps": -1},
        [30, 34],
        "{not json",
    ],
)
def test_invalid_params_raise_sampling_error(tmp_path, data):
    with pytest.raises(SamplingError):
        Params.load(write(tmp_path, data))


@pytest.mark.parametrize("rg,label", [(30, "rg30"), (30.0, "rg30"), (30.5, "rg30.5"), (100, "rg100")])
def test_rg_label_matches_bilbomd_foxs_dirs(rg, label):
    assert rg_label(rg) == label
