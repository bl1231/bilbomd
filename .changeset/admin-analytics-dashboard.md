---
"@bilbomd/backend": minor
"@bilbomd/ui": minor
"@bilbomd/bilbomd-types": patch
---
Add preparatory changes for the upcoming Admin Analytics Dashboard:

- Establish API routes and DTO groundwork for analytics (no breaking changes yet)
- Plan UI scaffolding for admin-only dashboards, charts, and filters
- Tighten role-based access to ensure only Admin/Manager can access analytics endpoints
- Small type refinements in shared `@bilbomd/bilbomd-types` to support analytics payloads

This changeset records intent and increments versions so downstream tasks for the dashboard can land cleanly with semver.
