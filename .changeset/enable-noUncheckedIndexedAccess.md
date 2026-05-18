---
'@bilbomd/ui': minor
---

Enable `noUncheckedIndexedAccess` TypeScript compiler option in apps/ui.

Array and object index access now returns `T | undefined` instead of `T`, catching potential out-of-bounds access at compile time. Fixed 175 type errors across 35 files by adding non-null assertions on bounds-checked loops, typed constant tuples, and explicit `??` fallbacks where undefined is a real possibility.
