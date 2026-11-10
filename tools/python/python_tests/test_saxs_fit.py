"""Tests for reading and scoring FoXS fit files."""

import numpy as np
import pytest

from saxs_fit import FitProfile, chi_square, load_fit_file, region_stats


def profile_from(q, residuals):
    """A profile whose error-normalised residuals are exactly `residuals`."""
    q = np.asarray(q, dtype=float)
    residuals = np.asarray(residuals, dtype=float)
    err = np.full_like(q, 2.0)
    i_model = np.full_like(q, 100.0)
    return FitProfile(q=q, i_exp=i_model + residuals * err, i_model=i_model, err=err)


def test_load_reads_four_columns_and_skips_comments(tmp_path):
    path = tmp_path / "fit.dat"
    path.write_text(
        "# SAXS profile: number of points = 3\n"
        "#  q       exp_intensity   model_intensity error\n"
        "0.01 10.0 9.0 0.5\n"
        "; a stray comment\n"
        "0.02 8.0 8.5 0.5\n"
        "0.03 6.0 6.0 0.25\n"
    )
    profile = load_fit_file(path)
    assert profile.q.tolist() == [0.01, 0.02, 0.03]
    assert profile.residuals.tolist() == [2.0, -1.0, 0.0]


def test_load_works_without_a_header(tmp_path):
    path = tmp_path / "fit.dat"
    path.write_text("0.01 10.0 9.0 0.5\n0.02 8.0 8.5 0.5\n")
    assert load_fit_file(path).q.size == 2


def test_load_drops_unusable_points_and_sorts_by_q(tmp_path):
    path = tmp_path / "fit.dat"
    path.write_text(
        "0.03 6.0 6.0 0.5\n"
        "0.01 10.0 9.0 0.5\n"
        "0.02 8.0 8.5 0.0\n"  # zero error
        "0.04 nan 5.0 0.5\n"  # not finite
        "0.05 4.0 4.0 -1.0\n"  # negative error
    )
    assert load_fit_file(path).q.tolist() == [0.01, 0.03]


def test_load_never_touches_other_files_in_the_folder(tmp_path, monkeypatch):
    # The old loader created and then deleted ./temp in the working directory,
    # which is the job's results folder.
    (tmp_path / "temp").mkdir()
    (tmp_path / "temp" / "keep.txt").write_text("user data")
    path = tmp_path / "fit.dat"
    path.write_text("0.01 10.0 9.0 0.5\n")
    monkeypatch.chdir(tmp_path)

    load_fit_file(path)

    assert (tmp_path / "temp" / "keep.txt").read_text() == "user data"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["fit.dat", "temp"]


@pytest.mark.parametrize(
    "content",
    ["0.01 10.0 9.0\n0.02 8.0 8.5\n", "0.01 10.0 9.0 0.0\n", "# only a header\n"],
    ids=["three columns", "no usable points", "no data"],
)
def test_load_rejects_files_it_cannot_score(tmp_path, content):
    path = tmp_path / "fit.dat"
    path.write_text(content)
    with pytest.warns() if content.startswith("#") else _no_warning():
        with pytest.raises(ValueError):
            load_fit_file(path)


class _no_warning:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_chi_square_is_the_mean_squared_residual():
    profile = profile_from([0.01, 0.02, 0.03, 0.04], [1.0, -1.0, 3.0, -1.0])
    assert chi_square(profile) == pytest.approx(3.0)
    assert chi_square(profile, profile.q > 0.025) == pytest.approx(5.0)


def test_chi_square_of_no_points_is_an_error():
    profile = profile_from([0.01, 0.02], [1.0, 1.0])
    with pytest.raises(ValueError):
        chi_square(profile, profile.q > 1.0)


def test_regions_partition_the_data():
    q = np.linspace(0.01, 0.4, 391)
    residuals = np.where(q < 0.1, 2.0, np.where(q < 0.2, -1.0, 0.5))
    regions = region_stats(profile_from(q, residuals))

    assert [r.name for r in regions] == ["low", "mid", "high"]
    assert sum(r.n_points for r in regions) == q.size
    assert [r.chi_square for r in regions] == pytest.approx([4.0, 1.0, 0.25])
    assert [r.mean_residual for r in regions] == pytest.approx([2.0, -1.0, 0.5])
    assert regions[0].q_min == pytest.approx(0.01)
    assert regions[0].q_max < 0.1 <= regions[1].q_min
    assert regions[2].q_max == pytest.approx(0.4)


def test_data_ending_below_a_boundary_have_fewer_regions():
    # Used to divide by zero in the empty high-q region
    q = np.linspace(0.01, 0.15, 141)
    regions = region_stats(profile_from(q, np.ones_like(q)))
    assert [r.name for r in regions] == ["low", "mid"]

    q = np.linspace(0.01, 0.08, 71)
    assert [r.name for r in region_stats(profile_from(q, np.ones_like(q)))] == ["low"]


def test_a_region_with_too_few_points_is_not_scored():
    q = np.concatenate([np.linspace(0.01, 0.099, 50), [0.11, 0.12]])
    regions = region_stats(profile_from(q, np.ones_like(q)))
    assert [r.name for r in regions] == ["low"]
