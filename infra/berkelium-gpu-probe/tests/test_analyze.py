import gzip
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import analyze  # noqa: E402

TZ = ZoneInfo("America/Los_Angeles")

# Trimmed from the real page, keeping its markup shape.
STATUS_HTML = """
<div>Cluster Hardware Inventory (Cached Snapshot)<span>&bull; Refreshed <!-- -->2:09:30 AM</span></div>
<script>var x = "NVIDIA-B300 99 GiB VRAM per GPU 9 Total GPUs Allocated: 0 / 9";</script>
<h3 class="h5">NVIDIA-H100-80GB-HBM3</h3><p>80 GiB VRAM per GPU &bull; 8 Total GPUs</p>
<div><span>Allocated: 8 / 8</span><span>100 % Available</span></div>
<h3 class="h5">NVIDIA-A40</h3><p>48 GiB VRAM per GPU &bull; 8 Total GPUs</p>
<div><span>Allocated: 6 / 8</span></div>
<h3 class="h5">AMD Instinct MI100</h3><p>32 GiB VRAM per GPU &bull; 12 Total GPUs</p>
<div><span>Allocated: 0 / 12</span></div>
"""


def probe(ts, cls, scheduled, secs=None, created=True, node=None, message=None, phase=None):
    return {
        "ts": ts,
        "class": cls,
        "created": created,
        "scheduled": scheduled,
        "seconds_to_schedule": secs,
        "wait_seconds": 180,
        "node": node,
        "phase": phase,
        "message": message,
        "own_gpu_pods": 0,
    }


def write_results(tmp_path, records, status=None):
    (tmp_path / "probes").mkdir()
    (tmp_path / "status").mkdir()
    by_class = {}
    for r in records:
        by_class.setdefault(r["class"], []).append(json.dumps(r))
    for cls, lines in by_class.items():
        (tmp_path / "probes" / f"{cls}.jsonl").write_text("\n".join(lines) + "\n")
    for name, raw in (status or {}).items():
        with gzip.open(tmp_path / "status" / f"{name}.html.gz", "wt") as fh:
            fh.write(raw)
    return tmp_path


def test_parse_status_html_reads_nvidia_pools_and_ignores_scripts():
    parsed = analyze.parse_status_html(STATUS_HTML)
    assert parsed["refreshed"] == "2:09:30 AM"
    assert parsed["pools"] == {
        "h100": {"model": "NVIDIA-H100-80GB-HBM3", "allocated": 8, "total": 8, "free": 0},
        "a40": {"model": "NVIDIA-A40", "allocated": 6, "total": 8, "free": 2},
    }


def test_parse_status_html_without_pools():
    assert analyze.parse_status_html("<html>maintenance</html>") == {
        "refreshed": None,
        "pools": {},
    }


def test_gpu_class():
    assert analyze.gpu_class("NVIDIA-H200-NVL") == "h200"
    assert analyze.gpu_class("NVIDIA-A100-80GB-PCIe") == "a100"
    assert analyze.gpu_class("AMD Instinct MI100") is None


def test_summary_counts_availability_streaks_and_errors():
    records = [
        probe("2026-11-10T17:00:00Z", "a100", True, 3, node="k8s-0005"),
        probe("2026-11-10T17:15:00Z", "a100", False, message="0/16 nodes are available"),
        probe("2026-11-10T17:30:00Z", "a100", False, message="0/16 nodes are available"),
        probe("2026-11-10T17:45:00Z", "a100", False, created=False),
        probe("2026-11-10T18:00:00Z", "a100", False, message="0/15 nodes are available"),
        probe("2026-11-10T18:15:00Z", "a100", True, 90, node="k8s-0005", phase="Failed"),
        probe("2026-11-10T18:30:00Z", "a100", False, message="other"),
    ]
    for r in records:
        r["_ts"] = analyze.parse_ts(r["ts"])

    s = analyze.summarize_probes(records, TZ)["a100"]

    assert s.samples == 7
    assert s.errors == 1
    assert s.valid == 6
    assert s.scheduled == 2
    assert s.immediate == 1
    assert s.gpu_failed == 1
    assert s.seconds == [3, 90]
    assert s.nodes == {"k8s-0005": 2}
    # The failed Job create neither breaks nor extends the outage
    assert s.longest_outage.samples == 3
    assert s.longest_outage.hours == 0.75
    assert s.reasons["N/N nodes are available"] == 3
    # 17:00Z = 09:00 Pacific (PST) on a Tuesday
    assert s.by_hour[9] == [True, False, False]
    assert s.by_weekday[1] == [True, False, False, False, True, False]


def test_main_reports_and_compares_with_status_page(tmp_path, capsys):
    records = [
        probe("2026-11-10T17:00:00Z", "a40", True, 2, node="k8s-0006"),
        probe("2026-11-10T17:15:00Z", "a40", False, message="pending"),
        probe("2026-11-10T17:00:00Z", "h100", False, message="pending"),
        probe("2026-11-10T17:15:00Z", "h200", False, message="pending"),
    ]
    results = write_results(
        tmp_path,
        records,
        {"20261110T170000Z": STATUS_HTML, "20261110T171500Z": STATUS_HTML},
    )
    csv_path = tmp_path / "out.csv"

    assert analyze.main([str(results), "--csv", str(csv_path)]) == 0

    out = capsys.readouterr().out
    assert "a40         2   50.0%   50.0%" in out
    assert "2 snapshots, 1 distinct 'Refreshed' times" in out
    # a40: page says 2 free both rounds; probe ran once, waited once
    assert "agree 50.0%; page said free but probe waited ×1; page said full but probe ran ×0" in out
    assert "agree 100.0%; page said free but probe waited ×0" in out
    assert out.count("not on the page") == 3  # a100, h200, b300

    rows = csv_path.read_text().splitlines()
    assert len(rows) == 5
    assert rows[1].split(",")[9:11] == ["2", "8"]


def test_main_without_records(tmp_path, capsys):
    (tmp_path / "probes").mkdir()
    assert analyze.main([str(tmp_path)]) == 1
    assert "No probe records" in capsys.readouterr().err
