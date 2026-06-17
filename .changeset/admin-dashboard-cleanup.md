---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Admin dashboard cleanup: remove the deprecated "BilboMD Job Statistics" panel and the legacy `/stats` endpoint (which relied on inaccurate denormalized user counters). Recreate the jobs-by-type pie chart in the Analytics section backed by accurate aggregation of the jobs collection, and add an all-time "Total Submitted" KPI sourced from the usage-event log.
