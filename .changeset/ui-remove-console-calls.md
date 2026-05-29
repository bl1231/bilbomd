---
'@bilbomd/ui': patch
---

Clean up unguarded `console.*` calls in the UI (#851). Removed stray debugging
`console.log` statements and dead commented-out console lines, and routed genuine
diagnostics through a new `utils/logger` abstraction whose `log`/`debug`/`info`
are no-ops in production builds while `warn`/`error` still surface. Added a
`no-console` ESLint rule (with a test-file exception) to prevent regressions.
