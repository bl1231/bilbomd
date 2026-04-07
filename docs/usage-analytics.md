# Usage Analytics Guide

This guide outlines common aggregation pipelines for the `UsageEvent` collection to drive the Admin stats dashboard.

## Per-Pipeline Counts
Group by `pipeline` and count events.

```js
[
  { $group: { _id: "$pipeline", count: { $sum: 1 } } },
  { $project: { pipeline: "$_id", count: 1, _id: 0 } }
]
```

## Success Rate by Pipeline
Success over terminal outcomes.

```js
[
  { $match: { eventType: { $in: ["job_completed", "job_failed", "job_cancelled"] } } },
  { $group: {
      _id: "$pipeline",
      total: { $sum: 1 },
      successes: { $sum: { $cond: [{ $eq: ["$eventType", "job_completed"] }, 1, 0] } }
  } },
  { $project: { pipeline: "$_id", successRate: { $cond: [{ $gt: ["$total", 0] }, { $divide: ["$successes", "$total"] }, 0 ] }, total: 1, _id: 0 } }
]
```

## Duration Stats (Completed Jobs)
Average and percentiles for `durationMs`.

```js
[
  { $match: { eventType: "job_completed", durationMs: { $gt: 0 } } },
  { $group: { _id: "$pipeline", avgMs: { $avg: "$durationMs" }, count: { $sum: 1 } } },
  { $project: { pipeline: "$_id", avgMs: 1, count: 1, _id: 0 } }
]
```

If using MongoDB `$percentile` (7.0+):

```js
[
  { $match: { eventType: "job_completed", durationMs: { $gt: 0 } } },
  { $group: {
      _id: "$pipeline",
      count: { $sum: 1 },
      percentiles: { $percentile: { input: "$durationMs", method: "approximate", p: [0.5, 0.9] } }
  } },
  { $project: {
      pipeline: "$_id",
      avgMs: { $avg: "$percentiles" },
      p50Ms: { $arrayElemAt: ["$percentiles", 0] },
      p90Ms: { $arrayElemAt: ["$percentiles", 1] },
      count: 1,
      _id: 0
  } }
]
```

## Anonymous vs User Split

```js
[
  { $group: { _id: { pipeline: "$pipeline", mode: "$context.access_mode" }, count: { $sum: 1 } } },
  { $project: { pipeline: "$_id.pipeline", access_mode: "$_id.mode", count: 1, _id: 0 } }
]
```

## Daily Trends

```js
[
  { $project: { pipeline: 1, day: { $dateTrunc: { unit: "day", date: "$timestamp" } } } },
  { $group: { _id: { pipeline: "$pipeline", day: "$day" }, count: { $sum: 1 } } },
  { $project: { pipeline: "$_id.pipeline", day: { $dateToString: { date: "$_id.day", format: "%Y-%m-%d" } }, count: 1, _id: 0 } },
  { $sort: { day: 1, pipeline: 1 } }
]
```

## Notes
- Ensure an index on `{ pipeline: 1, eventType: 1, timestamp: 1 }` for performance.
- If you need per-user stats, group by `context.user._id` while excluding anonymous events.
