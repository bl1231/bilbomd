---
'@bilbomd/ui': minor
---

Add comprehensive TypeScript types to RTK Query endpoints. Previously, 36 out of 69 RTK Query endpoints (52%) lacked explicit type parameters, causing result types to default to `any` and bypass TypeScript's type safety. This change adds proper generic type parameters `<ResultType, ArgType>` to all untyped endpoints across authApiSlice, configsApiSlice, statsApiSlice, adminApiSlice, usersApiSlice, and jobsApiSlice. Benefits include compile-time type safety, better IDE autocomplete, and self-documenting API contracts.
