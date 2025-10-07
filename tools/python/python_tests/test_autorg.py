# tools/python/test_autorg.py
import json
import sys
import tempfile

import tools.python.autorg as autorg


def test_auto_guinier_wraps_guinier_scan(monkeypatch):
    """Ensure _auto_guinier correctly calls guinier_scan and repacks the result."""
    called = {}

    def fake_scan(q, intensity, sigma, **kwargs):
        called.update(q=q, intensity=intensity, sigma=sigma, kwargs=kwargs)
        return {
            "Rg": 50.0,
            "I0": 100.0,
            "qmin": 0.01,
            "qmax": 0.1,
            "i": 0,
            "j": 5,
            "r2": 0.99,
        }

    monkeypatch.setattr(autorg, "guinier_scan", fake_scan)
    q, i, s = [1, 2, 3], [4, 5, 6], [0.1, 0.1, 0.1]
    result = autorg._auto_guinier(q, i, s)

    # Check that the mock was called with expected args
    assert called["q"] == q
    assert isinstance(result, tuple)
    # Rg and I0 should match fake_scan output
    assert result[0] == 50.0
    assert result[1] == 100.0


def test_calculate_rg_writes_expected_json(monkeypatch):
    """Test calculate_rg writes expected values to a JSON file."""
    # Mock load_profile to produce predictable q, intensity, sigma
    monkeypatch.setattr(
        autorg, "load_profile", lambda fp: ([1, 2, 3], [10, 20, 30], [1, 1, 1])
    )
    # Mock _auto_guinier to return a fixed rg
    monkeypatch.setattr(
        autorg,
        "_auto_guinier",
        lambda q, i, s: (40.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99),
    )

    with tempfile.NamedTemporaryFile("r+", delete=False) as tmp:
        autorg.calculate_rg("dummy_input.dat", tmp.name)
        tmp.seek(0)
        data = json.load(tmp)

    assert "rg" in data and "rg_min" in data and "rg_max" in data
    assert 10 <= data["rg_min"] <= 100
    assert 10 <= data["rg_max"] <= 100


def test_calculate_rg_handles_exceptions(monkeypatch, capsys):
    """If load_profile raises, ensure error is printed to stderr."""

    def bad_load_profile(_):
        raise IOError("boom")

    monkeypatch.setattr(autorg, "load_profile", bad_load_profile)
    # Should not raise, should write error to stderr
    autorg.calculate_rg("foo", "bar.json")
    captured = capsys.readouterr()
    assert "boom" in captured.err


def test_parse_args(monkeypatch):
    """Ensure parse_args reads positional arguments correctly."""
    test_args = ["autorg.py", "input.dat", "output.json"]
    monkeypatch.setattr(sys, "argv", test_args)
    args = autorg.parse_args()
    assert args.file_path == "input.dat"
    assert args.output_file == "output.json"
