---
'@bilbomd/worker': patch
---

Add unit test coverage for previously untested worker modules: usage-events (context building, event recording), NERSC API token caching/refresh logic, and the rgyr/dmax and feedback python-script spawn wrappers. Extend config tests to cover env-var parsing, validation, and boolean/default helpers. Extend job-utils tests to cover the CHARMM spawn wrapper (spawnCharmm), the writeInputFile failure path, an additional handleError branch, and the invalid-user and missing-email notification paths. Raises worker coverage from ~65% to ~72% statements (43% to 51% branches).
