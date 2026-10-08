---
'@bilbomd/ui': patch
---

Remove the unreachable `Home` component and its index route from `LoginRoutes`. The anonymous route tree already owns `/`, and session restore is handled by `PersistLogin` and `SoftPersistLogin`.
