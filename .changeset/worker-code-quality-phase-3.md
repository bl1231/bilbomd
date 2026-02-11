---
'@bilbomd/worker': minor
---

Enhance worker code quality with centralized configuration and comprehensive test coverage. Extract all magic numbers to config/constants.ts (worker concurrency, polling intervals, retry settings, progress calculation). Consolidate duplicated error handling into shared helpers/errors.ts utility. Add 100% test coverage for mongo-utils.ts and workerControl.ts, plus 63% coverage for job-utils.ts (39 new tests total). Improve runPythonStep.ts coverage from 88% to 92%. Remove dead/commented code across worker files.
