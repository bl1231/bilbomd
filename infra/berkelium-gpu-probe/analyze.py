#!/usr/bin/env python3
"""Summarize the Berkelium GPU availability study.

Reads the results fetched by ``deploy.sh fetch`` (probes/<class>.jsonl and
status/<round>.html.gz) and prints, for each GPU type:

* how often a single-GPU probe was scheduled within the wait window,
* how long scheduling took when it was,
* the longest run of consecutive failed probes,
* availability by hour of day and by weekday (local time),
* what the public status page claimed in the same rounds.

Standard library only (Python 3.9+).

    python3 analyze.py results/ [--tz America/Los_Angeles] [--csv probes.csv]
"""

from __future__ import annotations

import argparse
import csv
import gzip
import html
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CLASSES = ["a40", "a100", "h100", "h200", "b300"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
# A probe scheduled this fast found a GPU free; slower ones waited for one.
IMMEDIATE_SECONDS = 15
ROUND_RE = re.compile(r"(\d{8}T\d{6}Z)")


def parse_ts(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def round_ts(name: str) -> datetime | None:
    """The round timestamp in a status snapshot's file name."""
    match = ROUND_RE.search(name)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(
        tzinfo=timezone.utc
    )


def gpu_class(model: str) -> str | None:
    """Map a status-page model name (e.g. NVIDIA-H100-80GB-HBM3) to a class."""
    lower = model.lower()
    for cls in CLASSES:
        if cls in lower:
            return cls
    return None


# --- probes -------------------------------------------------------------------


def load_probes(results: Path) -> list[dict]:
    records = []
    for path in sorted((results / "probes").glob("*.jsonl")):
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                print(f"skipping bad line {path.name}:{lineno}", file=sys.stderr)
                continue
            rec["_ts"] = parse_ts(rec["ts"])
            records.append(rec)
    records.sort(key=lambda r: (r["class"], r["_ts"]))
    return records


@dataclass
class Streak:
    start: datetime
    end: datetime
    samples: int

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600


@dataclass
class ClassSummary:
    cls: str
    samples: int = 0
    errors: int = 0
    scheduled: int = 0
    immediate: int = 0
    gpu_failed: int = 0
    seconds: list[float] = field(default_factory=list)
    nodes: Counter = field(default_factory=Counter)
    reasons: Counter = field(default_factory=Counter)
    longest_outage: Streak | None = None
    by_hour: dict[int, list[bool]] = field(default_factory=lambda: defaultdict(list))
    by_weekday: dict[int, list[bool]] = field(
        default_factory=lambda: defaultdict(list)
    )

    @property
    def valid(self) -> int:
        return self.samples - self.errors

    @property
    def availability(self) -> float | None:
        return self.scheduled / self.valid if self.valid else None


def normalize_reason(message: str | None) -> str:
    """Collapse node counts so the same scheduler complaint groups together."""
    if not message:
        return "(no message)"
    return re.sub(r"\d+", "N", message)[:160]


def summarize_probes(records: list[dict], tz: ZoneInfo) -> dict[str, ClassSummary]:
    summaries: dict[str, ClassSummary] = {}
    for cls in sorted({r["class"] for r in records}, key=class_order):
        rows = [r for r in records if r["class"] == cls]
        s = ClassSummary(cls)
        streak: Streak | None = None
        for r in rows:
            s.samples += 1
            if not r.get("created", True):
                s.errors += 1
                continue
            ok = bool(r.get("scheduled"))
            local = r["_ts"].astimezone(tz)
            s.by_hour[local.hour].append(ok)
            s.by_weekday[local.weekday()].append(ok)
            if ok:
                s.scheduled += 1
                secs = r.get("seconds_to_schedule")
                if secs is not None:
                    s.seconds.append(secs)
                    if secs <= IMMEDIATE_SECONDS:
                        s.immediate += 1
                if r.get("node"):
                    s.nodes[r["node"]] += 1
                if r.get("phase") == "Failed":
                    s.gpu_failed += 1
                streak = None
            else:
                s.reasons[normalize_reason(r.get("message"))] += 1
                if streak is None:
                    streak = Streak(r["_ts"], r["_ts"], 1)
                else:
                    streak.end = r["_ts"]
                    streak.samples += 1
                if (
                    s.longest_outage is None
                    or streak.samples > s.longest_outage.samples
                ):
                    s.longest_outage = Streak(streak.start, streak.end, streak.samples)
        summaries[cls] = s
    return summaries


def class_order(cls: str) -> int:
    return CLASSES.index(cls) if cls in CLASSES else len(CLASSES)


# --- status page --------------------------------------------------------------

POOL_RE = re.compile(
    r"([A-Za-z0-9][\w-]*(?:A40|A100|H100|H200|B300)[\w-]*)\s+\d+\s*GiB VRAM per GPU"
    r".{0,80}?(\d+)\s*Total GPUs\s*Allocated:\s*(\d+)\s*/\s*(\d+)",
    re.S,
)
REFRESHED_RE = re.compile(r"Refreshed\s+([0-9: ]+[AP]M)")


def page_text(raw: str) -> str:
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", raw, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text))


def parse_status_html(raw: str) -> dict:
    """GPU pool counts and the snapshot time from the cluster status page."""
    text = page_text(raw)
    pools = {}
    for model, _total, allocated, total in POOL_RE.findall(text):
        cls = gpu_class(model)
        if cls and cls not in pools:
            pools[cls] = {
                "model": model,
                "allocated": int(allocated),
                "total": int(total),
                "free": int(total) - int(allocated),
            }
    refreshed = REFRESHED_RE.search(text)
    return {"refreshed": refreshed.group(1).strip() if refreshed else None, "pools": pools}


def load_status(results: Path) -> dict[datetime, dict]:
    snapshots = {}
    for path in sorted((results / "status").glob("*.html*")):
        ts = round_ts(path.name)
        if ts is None:
            continue
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8", errors="replace") as fh:
            snapshots[ts] = parse_status_html(fh.read())
    return snapshots


def match_snapshot(
    snapshots: dict[datetime, dict], ts: datetime, slack: timedelta
) -> dict | None:
    """The status snapshot from the same round as a probe, if there is one."""
    best = min(snapshots, key=lambda t: abs(t - ts), default=None)
    if best is None or abs(best - ts) > slack:
        return None
    return snapshots[best]


# --- report -------------------------------------------------------------------


def pct(num: int, den: int) -> str:
    return f"{100 * num / den:5.1f}%" if den else "    -"


def bool_pct(values: list[bool]) -> str:
    return pct(sum(values), len(values)).strip() if values else "-"


def fmt_seconds(values: list[float]) -> str:
    if not values:
        return "-"
    values = sorted(values)
    p90 = values[min(len(values) - 1, int(round(0.9 * (len(values) - 1))))]
    return f"median {statistics.median(values):.0f}s, p90 {p90:.0f}s"


def report(
    records: list[dict],
    summaries: dict[str, ClassSummary],
    snapshots: dict[datetime, dict],
    tz: ZoneInfo,
) -> str:
    out: list[str] = []
    if records:
        first, last = min(r["_ts"] for r in records), max(r["_ts"] for r in records)
        span = (last - first).total_seconds() / 86400
        out.append(
            f"Probes {first.astimezone(tz):%Y-%m-%d %H:%M} → "
            f"{last.astimezone(tz):%Y-%m-%d %H:%M} {tz.key} ({span:.1f} days)"
        )
        wait = records[0].get("wait_seconds")
        out.append(
            f"A probe counts as available if its 1-GPU pod was scheduled within "
            f"{wait} s; 'immediate' = within {IMMEDIATE_SECONDS} s."
        )
    out.append("")
    out.append(
        f"{'GPU':5} {'samples':>7} {'avail':>7} {'immed':>7}  "
        f"{'time to schedule':24} longest outage"
    )
    for s in summaries.values():
        outage = "-"
        if s.longest_outage:
            o = s.longest_outage
            outage = (
                f"{o.samples} probes, {o.hours:.1f} h from "
                f"{o.start.astimezone(tz):%a %m-%d %H:%M}"
            )
        out.append(
            f"{s.cls:5} {s.valid:7d} {pct(s.scheduled, s.valid):>7} "
            f"{pct(s.immediate, s.valid):>7}  {fmt_seconds(s.seconds):24} {outage}"
        )
        if s.errors:
            out.append(f"      ({s.errors} probes not counted: Job create failed)")
        if s.gpu_failed:
            out.append(f"      ({s.gpu_failed} scheduled probes failed to run)")

    out.append("")
    out.append(f"Availability by hour of day ({tz.key}):")
    out.append("hour  " + " ".join(f"{s.cls:>6}" for s in summaries.values()))
    for hour in range(24):
        cells = [bool_pct(s.by_hour.get(hour, [])) for s in summaries.values()]
        out.append(f"{hour:02d}    " + " ".join(f"{c:>6}" for c in cells))

    out.append("")
    out.append("Availability by weekday:")
    out.append("day   " + " ".join(f"{s.cls:>6}" for s in summaries.values()))
    for day, name in enumerate(WEEKDAYS):
        cells = [bool_pct(s.by_weekday.get(day, [])) for s in summaries.values()]
        out.append(f"{name}   " + " ".join(f"{c:>6}" for c in cells))

    out.append("")
    out.append("Nodes that ran successful probes:")
    for s in summaries.values():
        nodes = ", ".join(f"{n} ×{c}" for n, c in s.nodes.most_common()) or "-"
        out.append(f"  {s.cls:5} {nodes}")

    out.append("")
    out.append("Most common reasons a probe stayed Pending:")
    for s in summaries.values():
        for reason, count in s.reasons.most_common(2):
            out.append(f"  {s.cls:5} ×{count}: {reason}")

    out.extend(status_section(records, snapshots))
    return "\n".join(out)


def status_section(records: list[dict], snapshots: dict[datetime, dict]) -> list[str]:
    out = ["", "Status page (https://berkelium.scs.lbl.gov/cluster/):"]
    if not snapshots:
        return out + ["  no snapshots"]
    refreshed = {s["refreshed"] for s in snapshots.values()}
    out.append(
        f"  {len(snapshots)} snapshots, {len(refreshed)} distinct 'Refreshed' times "
        "(fewer distinct times than snapshots = the page was stale)"
    )
    slack = timedelta(minutes=5)
    out.append(
        f"  {'GPU':5} {'listed':>6} {'free>0':>7}   probe vs page in the same round"
    )
    for cls in CLASSES:
        listed = [s["pools"][cls] for s in snapshots.values() if cls in s["pools"]]
        agree = disagree_page_free = disagree_page_full = 0
        for r in records:
            if r["class"] != cls or not r.get("created", True):
                continue
            snap = match_snapshot(snapshots, r["_ts"], slack)
            if not snap or cls not in snap["pools"]:
                continue
            page_free = snap["pools"][cls]["free"] > 0
            if page_free == bool(r.get("scheduled")):
                agree += 1
            elif page_free:
                disagree_page_free += 1
            else:
                disagree_page_full += 1
        compared = agree + disagree_page_free + disagree_page_full
        free = sum(1 for p in listed if p["free"] > 0)
        comparison = (
            f"agree {pct(agree, compared).strip()}; page said free but probe "
            f"waited ×{disagree_page_free}; page said full but probe ran "
            f"×{disagree_page_full}"
            if compared
            else "not on the page"
        )
        out.append(
            f"  {cls:5} {len(listed):6d} {pct(free, len(listed)):>7}   {comparison}"
        )
    return out


def write_csv(
    path: Path, records: list[dict], snapshots: dict[datetime, dict], tz: ZoneInfo
) -> None:
    slack = timedelta(minutes=5)
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "ts_utc",
                "ts_local",
                "class",
                "created",
                "scheduled",
                "seconds_to_schedule",
                "node",
                "phase",
                "own_gpu_pods",
                "page_free",
                "page_total",
                "reason",
                "message",
            ]
        )
        for r in records:
            snap = match_snapshot(snapshots, r["_ts"], slack)
            pool = snap["pools"].get(r["class"]) if snap else None
            writer.writerow(
                [
                    r["ts"],
                    r["_ts"].astimezone(tz).isoformat(),
                    r["class"],
                    r.get("created"),
                    r.get("scheduled"),
                    r.get("seconds_to_schedule"),
                    r.get("node"),
                    r.get("phase"),
                    r.get("own_gpu_pods"),
                    pool["free"] if pool else None,
                    pool["total"] if pool else None,
                    r.get("reason"),
                    r.get("message"),
                ]
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("results", type=Path, help="directory from deploy.sh fetch")
    parser.add_argument("--tz", default="America/Los_Angeles")
    parser.add_argument("--csv", type=Path, help="also write one row per probe")
    args = parser.parse_args(argv)

    tz = ZoneInfo(args.tz)
    records = load_probes(args.results)
    if not records:
        print(f"No probe records under {args.results}/probes", file=sys.stderr)
        return 1
    snapshots = load_status(args.results)
    print(report(records, summarize_probes(records, tz), snapshots, tz))
    if args.csv:
        write_csv(args.csv, records, snapshots, tz)
        print(f"\nWrote {args.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
