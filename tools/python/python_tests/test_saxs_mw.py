"""Tests for the Rambo-Tainer volume-of-correlation MW estimate."""

import numpy as np
import pytest

from saxs_mw import VC_CONSTANTS, correlation_volume, estimate_mw_vc

RG = 20.0
I0 = 50.0


def gaussian_profile(rg=RG, i0=I0, q_min=0.005, q_max=0.4, n=400):
    """
    I(q) = I0 * exp(-(q * Rg)^2 / 3) at every q. For this curve the integral of
    q * I(q) from 0 to infinity is I0 * 3 / (2 * Rg^2), so Vc = 2 * Rg^2 / 3.
    """
    q = np.linspace(q_min, q_max, n)
    intensity = i0 * np.exp(-((q * rg) ** 2) / 3.0)
    return q, intensity, 0.01 * intensity


def expected_mw_kda(rg, particle="protein"):
    vc = 2.0 * rg * rg / 3.0
    c, k = VC_CONSTANTS[particle]
    return ((vc * vc / rg) / c) ** k / 1000.0


def test_recovers_the_analytic_answer():
    estimate = estimate_mw_vc(*gaussian_profile())

    assert estimate.assessed
    assert estimate.rg == pytest.approx(RG, rel=1e-3)
    assert estimate.i0 == pytest.approx(I0, rel=1e-3)
    assert estimate.vc == pytest.approx(2.0 * RG * RG / 3.0, rel=5e-3)
    assert estimate.mw_kda == pytest.approx(expected_mw_kda(RG), rel=1e-2)
    assert estimate.qmax_used == pytest.approx(0.3)
    assert not estimate.short_q_range
    assert estimate.reason is None


def test_is_independent_of_the_intensity_scale():
    q, intensity, sigma = gaussian_profile()
    small = estimate_mw_vc(q, intensity, sigma)
    large = estimate_mw_vc(q, intensity * 1e4, sigma * 1e4)
    assert large.mw_kda == pytest.approx(small.mw_kda, rel=1e-9)


def test_rna_uses_its_own_constants():
    estimate = estimate_mw_vc(*gaussian_profile(), particle="rna")
    assert estimate.particle == "rna"
    assert estimate.mw_kda == pytest.approx(expected_mw_kda(RG, "rna"), rel=1e-2)


def test_unknown_particle_type_is_a_programming_error():
    with pytest.raises(ValueError):
        estimate_mw_vc(*gaussian_profile(), particle="lipid")


def test_missing_low_q_is_filled_in_from_the_guinier_fit():
    # Starting the data later must not change Vc: the part below the first
    # point is extrapolated.
    q_fine, i_fine, _ = gaussian_profile(q_min=0.001, n=4000)
    q_late, i_late, _ = gaussian_profile(q_min=0.02, n=4000)
    assert correlation_volume(q_late, i_late, I0, RG) == pytest.approx(
        correlation_volume(q_fine, i_fine, I0, RG), rel=1e-3
    )


def test_negative_intensities_do_not_break_the_guinier_fit():
    q, intensity, sigma = gaussian_profile()
    intensity = intensity.copy()
    intensity[-20:] = -1e-6  # over-subtracted buffer at high q
    estimate = estimate_mw_vc(q, intensity, sigma)
    assert estimate.mw_kda == pytest.approx(expected_mw_kda(RG), rel=1e-2)


def test_no_guinier_region_is_reported_not_raised():
    # Intensity rising with q has no Guinier region. The old code turned this
    # into MW = 0 and a "100 % error" verdict.
    q = np.linspace(0.005, 0.4, 400)
    intensity = 1.0 + 10.0 * q
    estimate = estimate_mw_vc(q, intensity, 0.01 * intensity)

    assert not estimate.assessed
    assert estimate.mw_kda is None
    assert "Guinier" in estimate.reason


def test_too_few_points_is_reported_not_raised():
    q = np.array([0.01, 0.02, 0.03])
    estimate = estimate_mw_vc(q, np.array([3.0, 2.0, 1.0]), np.ones(3))
    assert not estimate.assessed
    assert estimate.reason


def test_a_noisy_guinier_region_is_flagged_but_still_estimated():
    rng = np.random.default_rng(0)
    q, intensity, _ = gaussian_profile()
    sigma = 0.05 * intensity  # 5 % noise puts R² near 0.93
    estimate = estimate_mw_vc(q, intensity + sigma * rng.standard_normal(q.size), sigma)

    assert estimate.assessed
    assert 0.90 <= estimate.guinier_r2 < 0.95
    assert estimate.weak_guinier


def test_a_clean_guinier_region_is_not_flagged():
    assert not estimate_mw_vc(*gaussian_profile()).weak_guinier


def test_a_short_q_range_is_flagged():
    estimate = estimate_mw_vc(*gaussian_profile(q_max=0.2))
    assert estimate.assessed
    assert estimate.qmax_used == pytest.approx(0.2)
    assert estimate.short_q_range
