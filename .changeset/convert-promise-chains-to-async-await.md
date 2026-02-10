---
'@bilbomd/backend': patch
---

Convert promise chains to async/await for better readability

- Converted `.then()` chains to async/await in job controller files
- Updated createJob.ts: replaced Promise.all().then() with separate await and reduce
- Updated sansJobController.ts: replaced Promise.all().then() with separate await and reduce
- Added comprehensive tests for job quota checking logic (6 tests, 100% passing)
- Improves code readability by using modern async/await patterns instead of promise chaining
