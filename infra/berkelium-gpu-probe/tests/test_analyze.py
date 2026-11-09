import gzip
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import analyze  # noqa: E402

TZ = ZoneInfo("America/Los_Angeles")

# Shape of a real GetClusterInfo reply (proto3 JSON omits zero values).
CLUSTER_INFO = {
    "updatedAt": "2026-11-10T17:00:05Z",
    "nodes": [
        {"name": "k8s-0000", "status": "Ready", "gpuType": "None", "gpuModel": "None (CPU Worker)"},
        {"name": "k8s-0001", "status": "Ready", "gpuModel": "AMD Instinct MI100", "gpuAllocatable": 4, "gpuFree": 4},
        {"name": "k8s-0002", "status": "Ready", "gpuModel": "NVIDIA A40", "gpuAllocatable": 4, "gpuAllocated": 1, "gpuFree": 3},
        {"name": "k8s-0006", "status": "Ready", "gpuModel": "NVIDIA A40", "gpuAllocatable": 4, "gpuAllocated": 4},
        {"name": "k8s-0007", "status": "Ready", "gpuModel": "NVIDIA H100 80GB HBM3", "gpuAllocatable": 8, "gpuAllocated": 8},
        {"name": "k8s-0011", "status": "Ready", "gpuModel": "NVIDIA H200 NVL", "gpuAllocatable": 8, "gpuAllocated": 8},
        {"name": "k8s-0012", "status": "Ready", "unschedulable": True, "gpuModel": "NVIDIA H200 NVL", "gpuAllocatable": 8, "gpuFree": 8},
    ],
}


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
    for name, data in (status or {}).items():
        with gzip.open(tmp_path / "status" / f"{name}.json.gz", "wt") as fh:
            json.dump(data, fh)
    return tmp_path


def test_parse_cluster_info_counts_schedulable_nodes_only():
    parsed = analyze.parse_cluster_info(CLUSTER_INFO)
    assert parsed["updated_at"] == "2026-11-10T17:00:05Z"
    assert parsed["pools"] == {
        "a40": {"total": 8, "allocated": 5, "free": 3, "cordoned": 0},
        "h100": {"total": 8, "allocated": 8, "free": 0, "cordoned": 0},
        # k8s-0012's 8 "free" H200s are cordoned, so none are usable
        "h200": {"total": 8, "allocated": 8, "free": 0, "cordoned": 8},
    }


def test_parse_cluster_info_without_nodes():
    assert analyze.parse_cluster_info({}) == {"updated_at": None, "pools": {}}


def test_load_status_skips_corrupt_files(tmp_path, capsys):
    write_results(tmp_path, [], {"20261110T170000Z": CLUSTER_INFO})
    (tmp_path / "status" / "20261110T171500Z.json.gz").write_bytes(b"not gzip")
    snapshots = analyze.load_status(tmp_path)
    assert list(snapshots) == [analyze.round_ts("20261110T170000Z")]
    assert "skipping 20261110T171500Z.json.gz" in capsys.readouterr().err


def test_gpu_class():
    assert analyze.gpu_class("NVIDIA H200 NVL") == "h200"
    assert analyze.gpu_class("NVIDIA A100 80GB PCIe") == "a100"
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


def test_main_reports_and_compares_with_cluster_info(tmp_path, capsys):
    records = [
        probe("2026-11-10T17:00:00Z", "a40", True, 2, node="k8s-0006"),
        probe("2026-11-10T17:15:00Z", "a40", False, message="pending"),
        probe("2026-11-10T17:00:00Z", "h100", False, message="pending"),
        probe("2026-11-10T17:15:00Z", "h200", False, message="pending"),
    ]
    results = write_results(
        tmp_path,
        records,
        {"20261110T170000Z": CLUSTER_INFO, "20261110T171500Z": CLUSTER_INFO},
    )
    csv_path = tmp_path / "out.csv"

    assert analyze.main([str(results), "--csv", str(csv_path)]) == 0

    out = capsys.readouterr().out
    assert "a40         2   50.0%   50.0%" in out
    assert "2 snapshots; counts exclude cordoned/NotReady nodes" in out
    # a40: API says 3 free both rounds; probe ran once, waited once
    assert "a40      8       3.0  100.0%   agree 50.0%; API said free but probe waited ×1" in out
    # h200: the cordoned node's free GPUs don't count, so the API agrees
    assert "h200     8       0.0    0.0%   agree 100.0%" in out
    assert "h100     8       0.0    0.0%   agree 100.0%" in out
    assert out.count("not reported") == 2  # a100, b300

    rows = csv_path.read_text().splitlines()
    assert len(rows) == 5
    assert rows[1].split(",")[9:11] == ["3", "8"]


def test_main_without_records(tmp_path, capsys):
    (tmp_path / "probes").mkdir()
    assert analyze.main([str(tmp_path)]) == 1
    assert "No probe records" in capsys.readouterr().err
