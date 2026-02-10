---
'@bilbomd/backend': patch
---

Add comprehensive unit tests for verifyJWT and jobCleaner middleware functions

- Add 9 tests for verifyJWT middleware covering authentication flows, error handling, and token validation
- Add 9 tests for jobCleaner middleware covering database cleanup, filesystem operations, and error handling
- Achieve 98.46% statement coverage and 87.5% branch coverage for middleware
- All tests use proper TypeScript types with zero `any` usage
