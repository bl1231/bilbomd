---
'@bilbomd/ui': patch
---

Fix two Vite build warnings: replace vite-tsconfig-paths plugin with Vite's native resolve.tsconfigPaths option, and convert About component to lazy import in AnonRoutes to resolve ineffective dynamic import warning.
