---
'@bilbomd/mongodb-schema': patch
---

Remove stale GitHub Actions workflows left over from when mongodb-schema was a standalone repo. These files (`publish.yml`, `publish-dev.yml`, `dependabot.yml`) were nested inside `src/.github/` and were never executed by GitHub Actions in the monorepo. The monorepo CI already handles building and versioning this package.
