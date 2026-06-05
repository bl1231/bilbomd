#!/usr/bin/env python3
"""
Parse a BilboMD worker log file and print timing statistics for a specific job UUID.

Usage:
    python parse_job_timing.py <logfile> <job-uuid>
    python parse_job_timing.py <logfile>          # lists all job UUIDs found

Log format expected (winston JSON):
    {"level":"info","message":"...","label":"bilbomd-worker","timestamp":"2024-01-15 10:30:45"}

Note: Python stdout lines ([minimize][stdout] etc.) do not contain the job UUID,
so step end times are found by searching the full log after the step start time.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

TIMESTAMP_FMT = "%Y-%m-%d %H:%M:%S"


def parse_log(path: Path) -> list[dict]:
    entries = []
    with open(path, encoding="utf-8") as f:
        for lineno, raw in enumerate(f, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
                ts_str = entry.get("timestamp", "")
                entry["_ts"] = datetime.strptime(ts_str, TIMESTAMP_FMT) if ts_str else None
                entry["_lineno"] = lineno
                entries.append(entry)
            except (json.JSONDecodeError, ValueError):
                pass
    return entries


def find_uuids(entries: list[dict]) -> list[str]:
    uuid_pattern = re.compile(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I
    )
    seen: dict[str, datetime | None] = {}
    for e in entries:
        msg = e.get("message", "")
        for m in uuid_pattern.findall(msg):
            if m not in seen:
                seen[m] = e["_ts"]
    return list(seen.keys())


def entries_containing_uuid(entries: list[dict], uuid: str) -> list[dict]:
    return [e for e in entries if uuid.lower() in e.get("message", "").lower()]


def fmt_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    return f"{m}m {s:02d}s"


def delta(t1: datetime | None, t2: datetime | None) -> str:
    if t1 is None or t2 is None:
        return "?"
    return fmt_duration(abs((t2 - t1).total_seconds()))


def find_first(entries: list[dict], *patterns: str) -> tuple[datetime | None, str | None]:
    """Find first entry whose message contains any of the given patterns."""
    for e in entries:
        msg = e.get("message", "")
        for pat in patterns:
            if pat in msg:
                return e["_ts"], msg
    return None, None


def find_first_after(
    all_entries: list[dict],
    after_ts: datetime | None,
    *patterns: str,
    before_ts: datetime | None = None,
) -> tuple[datetime | None, str | None]:
    """
    Search the full log (not UUID-filtered) for the first match after after_ts.
    Optionally stop at before_ts. Used for Python stdout lines that have no UUID.
    """
    for e in all_entries:
        ts = e["_ts"]
        if after_ts and ts and ts < after_ts:
            continue
        if before_ts and ts and ts > before_ts:
            break
        msg = e.get("message", "")
        for pat in patterns:
            if pat in msg:
                return ts, msg
    return None, None


def find_all_after(
    all_entries: list[dict],
    after_ts: datetime | None,
    pattern: str,
    before_ts: datetime | None = None,
) -> list[tuple[datetime | None, str]]:
    results = []
    for e in all_entries:
        ts = e["_ts"]
        if after_ts and ts and ts < after_ts:
            continue
        if before_ts and ts and ts > before_ts:
            break
        msg = e.get("message", "")
        if pattern in msg:
            results.append((ts, msg))
    return results


def extract_rg(msg: str) -> str | None:
    m = re.search(r"rg=([0-9.]+)", msg, re.I)
    return m.group(1) if m else None


def extract_platform(msg: str) -> str | None:
    m = re.search(r"Initialized on platform:\s*(\S+)", msg)
    if m:
        # strip trailing punctuation
        return m.group(1).rstrip(".,)")
    return None


def extract_speed(msg: str) -> str | None:
    # StateDataReporter CSV row format (after the [md rg=X GPU=Y][stdout] prefix):
    #   step,PE,TE,temperature,speed
    # e.g. "11000,-69407.8,-35197.5,349.7,284"
    # The speed column is a non-negative integer/float as the last field.
    m = re.search(r"\d+,[-\d.]+,[-\d.]+,[-\d.]+,([\d.]+)$", msg)
    if m:
        speed = float(m.group(1))
        if 0 < speed < 100_000:
            return f"{speed:.0f} ns/day"
    return None


def print_timing(all_entries: list[dict], uuid: str) -> None:
    uuid_entries = entries_containing_uuid(all_entries, uuid)
    if not uuid_entries:
        print(f"No log entries found for UUID: {uuid}")
        return

    first_ts = next((e["_ts"] for e in uuid_entries if e["_ts"]), None)
    last_ts = next((e["_ts"] for e in reversed(uuid_entries) if e["_ts"]), None)

    print(f"\n{'='*60}")
    print(f"Job UUID : {uuid}")
    print(f"UUID log lines: {len(uuid_entries)}")
    if first_ts:
        print(f"Started  : {first_ts.strftime(TIMESTAMP_FMT)}")
    if last_ts:
        print(f"Last seen: {last_ts.strftime(TIMESTAMP_FMT)}")
    print(f"{'='*60}\n")

    # ── Minimize ──────────────────────────────────────────────
    # All boundary messages now carry the UUID.
    min_start_ts, _ = find_first(
        uuid_entries,
        "Starting OpenMM minimize",
        "Starting CHARMM minimize",
    )
    heat_start_ts, _ = find_first(
        uuid_entries,
        "Starting OpenMM heat",
        "Starting CHARMM heat",
    )
    md_start_ts, _ = find_first(
        uuid_entries,
        "Starting OpenMM md",
        "Starting CHARMM MD",
    )
    foxs_start_ts, _ = find_first(uuid_entries, "Starting FoXS")
    if not foxs_start_ts:  # fallback for logs before the new log messages
        foxs_start_ts, _ = find_first(uuid_entries, "MD directories with PDB files")

    multifoxs_start_ts, _ = find_first(uuid_entries, "Starting MultiFoXS")
    if not multifoxs_start_ts:  # fallback for logs before the new log messages
        multifoxs_start_ts, _ = find_first(
            [e for e in uuid_entries if "multifoxs" in e.get("message", "").lower()],
            "Create Dir:",
        )

    # "Completed" messages now carry UUID — fall back to Python stdout for old logs
    min_end_ts, _ = find_first(
        uuid_entries,
        "Completed OpenMM minimize",
        "Completed CHARMM minimize",
    )
    if not min_end_ts:
        min_end_ts, _ = find_first_after(
            all_entries, min_start_ts,
            "[minimize][stdout] ✅ Saved minimized.pdb",
            "[minimize][stdout] ✅ Minimization complete",
            before_ts=heat_start_ts,
        )

    _, min_platform_msg = find_first_after(
        all_entries, min_start_ts,
        "[minimize][stdout] Initialized on platform",
        "[minimize][stderr] Initialized on platform",
        before_ts=heat_start_ts,
    )
    min_platform = extract_platform(min_platform_msg or "")

    _, min_energy_msg = find_first_after(
        all_entries, min_start_ts,
        "Post-minimization potential energy",
        before_ts=heat_start_ts,
    )
    min_energy = None
    if min_energy_msg:
        m = re.search(r"potential energy:\s*([-\d.eE+]+)\s*kJ", min_energy_msg)
        if m:
            try:
                min_energy = f"{float(m.group(1)):,.0f} kJ/mol"
            except ValueError:
                min_energy = m.group(1) + " kJ/mol"

    print("── Minimize ──────────────────────────────────────────")
    print(f"  Start   : {min_start_ts or '(not found)'}")
    print(f"  End     : {min_end_ts or '(not found)'}")
    print(f"  Duration: {delta(min_start_ts, min_end_ts)}")
    if min_platform:
        print(f"  Platform: {min_platform}")
    if min_energy:
        print(f"  Energy  : {min_energy}")

    # ── Heat ─────────────────────────────────────────────────
    heat_end_ts, _ = find_first(
        uuid_entries,
        "Completed OpenMM heat",
        "Completed CHARMM heat",
    )
    if not heat_end_ts:
        heat_end_ts, _ = find_first_after(
            all_entries, heat_start_ts,
            "[heat][stdout] ✅ Heating complete",
            "[heat][stdout] ✅ Saved heated.pdb",
            before_ts=md_start_ts,
        )

    _, heat_platform_msg = find_first_after(
        all_entries, heat_start_ts,
        "[heat][stdout] Initialized on platform",
        "[heat][stderr] Initialized on platform",
        before_ts=md_start_ts,
    )
    heat_platform = extract_platform(heat_platform_msg or "")

    heat_step_entries = find_all_after(
        all_entries, heat_start_ts,
        "[heat][stdout] Step",
        before_ts=md_start_ts,
    )
    last_heat_step = None
    if heat_step_entries:
        m = re.search(r"Step\s+(\d+)", heat_step_entries[-1][1])
        last_heat_step = int(m.group(1)) if m else None

    print("\n── Heat ──────────────────────────────────────────────")
    print(f"  Start   : {heat_start_ts or '(not found)'}")
    print(f"  End     : {heat_end_ts or '(not found)'}")
    print(f"  Duration: {delta(heat_start_ts, heat_end_ts)}")
    if heat_platform:
        print(f"  Platform: {heat_platform}")
    if last_heat_step is not None:
        print(f"  Last step logged: {last_heat_step}")

    # ── MD (per Rg) ───────────────────────────────────────────
    print("\n── MD (per Rg) ───────────────────────────────────────")

    launches = find_all_after(all_entries, md_start_ts, "[md] launching rg=")
    completions = find_all_after(all_entries, md_start_ts, "[md] completed rg=")

    rg_launch: dict[str, datetime | None] = {}
    rg_done: dict[str, datetime | None] = {}
    for ts, msg in launches:
        rg = extract_rg(msg)
        if rg and rg not in rg_launch:
            rg_launch[rg] = ts
    for ts, msg in completions:
        rg = extract_rg(msg)
        if rg:
            rg_done[rg] = ts

    # Collect platform and speed per rg from the full log
    rg_platform: dict[str, str] = {}
    rg_speeds: dict[str, list[str]] = {}
    if md_start_ts:
        for e in all_entries:
            ts = e["_ts"]
            if ts and ts < md_start_ts:
                continue
            msg = e.get("message", "")
            rg_match = re.search(r"\[md rg=([0-9.]+)", msg)
            if not rg_match:
                continue
            rg = rg_match.group(1)
            p = extract_platform(msg)
            if p:
                rg_platform[rg] = p
            spd = extract_speed(msg)
            if spd:
                rg_speeds.setdefault(rg, []).append(spd)

    md_overall_end_ts = (
        max((t for t in rg_done.values() if t), default=None)
        if rg_done else None
    )

    all_rgs = sorted(set(list(rg_launch.keys()) + list(rg_done.keys())), key=float)

    if all_rgs:
        header = f"  {'Rg':>6}  {'Start':>20}  {'Duration':>10}  {'Platform':>12}  {'Speed (last)':>14}"
        print(header)
        print("  " + "-" * (len(header) - 2))
        for rg in all_rgs:
            t0 = rg_launch.get(rg)
            t1 = rg_done.get(rg)
            dur = delta(t0, t1)
            t0_str = t0.strftime("%H:%M:%S") if t0 else "?"
            plat = rg_platform.get(rg, "?")
            speeds = rg_speeds.get(rg, [])
            last_speed = speeds[-1] if speeds else "?"
            status = "" if rg in rg_done else "  ⚠ incomplete"
            print(f"  {float(rg):>6.1f}  {t0_str:>20}  {dur:>10}  {plat:>12}  {last_speed:>14}{status}")
    else:
        print("  (no MD Rg runs found)")

    print(f"\n  Overall MD start   : {md_start_ts or '(not found)'}")
    print(f"  Overall MD end     : {md_overall_end_ts or '(not found)'}")
    print(f"  Overall MD duration: {delta(md_start_ts, md_overall_end_ts)}")

    # ── FoXS (on MD frames) ───────────────────────────────────
    foxs_end_ts, _ = find_first(uuid_entries, "Completed FoXS")
    # Fallback for older logs without the new UUID messages
    if not foxs_end_ts:
        foxs_end_ts, _ = find_first_after(
            all_entries, foxs_start_ts,
            "FoXS processing completed:",
            before_ts=multifoxs_start_ts,
        )

    _, foxs_workers_msg = find_first_after(
        all_entries, foxs_start_ts,
        "concurrent FoXS workers",
        before_ts=foxs_end_ts,
    )
    foxs_workers_info = None
    if foxs_workers_msg:
        m = re.search(r"Using (\d+) concurrent FoXS workers \(([^)]+)\)", foxs_workers_msg)
        if m:
            foxs_workers_info = f"{m.group(1)} workers ({m.group(2)})"

    _, foxs_summary_msg = find_first_after(
        all_entries, foxs_start_ts,
        "FoXS processing completed:",
        before_ts=multifoxs_start_ts,
    )
    foxs_file_counts = None
    if foxs_summary_msg:
        m = re.search(r"(\d+) successful, (\d+) failed out of (\d+) total", foxs_summary_msg)
        if m:
            foxs_file_counts = f"{m.group(1)} ok / {m.group(2)} failed / {m.group(3)} total"

    foxs_progress_entries = find_all_after(
        all_entries, foxs_start_ts,
        "FoXS progress:",
        before_ts=foxs_end_ts,
    )
    last_foxs_pct = None
    if foxs_progress_entries:
        m = re.search(r"\((\d+)%\)", foxs_progress_entries[-1][1])
        last_foxs_pct = m.group(1) + "%" if m else None

    print("\n── FoXS (MD frames) ──────────────────────────────────")
    print(f"  Start   : {foxs_start_ts or '(not found)'}")
    print(f"  End     : {foxs_end_ts or '(not found)'}")
    print(f"  Duration: {delta(foxs_start_ts, foxs_end_ts)}")
    if foxs_workers_info:
        print(f"  Workers : {foxs_workers_info}")
    if foxs_file_counts:
        print(f"  Files   : {foxs_file_counts}")
    if last_foxs_pct and not foxs_end_ts:
        print(f"  Progress: {last_foxs_pct} (incomplete)")

    # ── MultiFoXS ─────────────────────────────────────────────
    multifoxs_end_ts, _ = find_first(uuid_entries, "Completed MultiFoXS")
    # Fallback for older logs
    if not multifoxs_end_ts:
        multifoxs_end_ts, _ = find_first_after(
            all_entries, multifoxs_start_ts,
            "spawnMultiFoxs close success exit code: 0",
        )

    _, multifoxs_ensembles_msg = find_first_after(
        all_entries, multifoxs_start_ts,
        "ensemble files",
    )
    multifoxs_ensembles = None
    if multifoxs_ensembles_msg:
        m = re.search(r"Found (\d+) ensemble files", multifoxs_ensembles_msg)
        multifoxs_ensembles = f"{m.group(1)} ensemble files" if m else None

    print("\n── MultiFoXS ─────────────────────────────────────────")
    print(f"  Start   : {multifoxs_start_ts or '(not found)'}")
    print(f"  End     : {multifoxs_end_ts or '(not found)'}")
    print(f"  Duration: {delta(multifoxs_start_ts, multifoxs_end_ts)}")
    if multifoxs_ensembles:
        print(f"  Output  : {multifoxs_ensembles}")

    # ── Total ────────────────────────────────────────────────
    print("\n── Total ─────────────────────────────────────────────")
    print(f"  Wall time: {delta(first_ts, last_ts)}")

    # Platform warnings
    warnings = []
    if min_platform and min_platform.lower() in ("reference", "cpu"):
        warnings.append(f"minimize ran on {min_platform} (not GPU!)")
    if heat_platform and heat_platform.lower() in ("reference", "cpu"):
        warnings.append(f"heat ran on {heat_platform} (not GPU!)")
    for rg, p in rg_platform.items():
        if p.lower() in ("reference", "cpu"):
            warnings.append(f"md rg={rg} ran on {p} (not GPU!)")
    for w in warnings:
        print(f"  ⚠  WARNING: {w}")

    print()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    log_path = Path(sys.argv[1])
    if not log_path.exists():
        print(f"File not found: {log_path}")
        sys.exit(1)

    all_entries = parse_log(log_path)
    if not all_entries:
        print("No JSON log entries found. Is this the right file?")
        sys.exit(1)

    if len(sys.argv) < 3:
        uuids = find_uuids(all_entries)
        if not uuids:
            print("No job UUIDs found in log.")
            sys.exit(1)
        print(f"Found {len(uuids)} job UUID(s) in {log_path.name}:\n")
        for u in uuids:
            print(f"  {u}")
        print(f"\nRe-run with a UUID argument to see timing details.")
        sys.exit(0)

    uuid = sys.argv[2]
    print_timing(all_entries, uuid)


if __name__ == "__main__":
    main()
