---
'@bilbomd/backend': patch
---

Refactor FoXS data layer: split downloadController into foxsController + foxsDataService + foxsParser, decouple business logic from HTTP, eliminate duplicate type definitions, add unit tests.
