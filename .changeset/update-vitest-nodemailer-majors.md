---
'@bilbomd/backend': patch
'@bilbomd/scoper': patch
'@bilbomd/worker': patch
'@bilbomd/md-utils': patch
---

Update nodemailer 9 → 10 and vitest 4 → 5 (with @vitest/coverage-v8 and @vitest/ui). nodemailer 10 ships its own type declarations, so `@types/nodemailer` and `@types/nodemailer-express-handlebars` were removed in favour of a small local declaration for the handlebars plugin written against nodemailer's bundled types. Vitest 5 now clears mock call history before every test by default; the handful of tests that asserted on module-import-time side effects were updated to re-import the module under test per test. No runtime behaviour changes.
