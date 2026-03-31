---
'@bilbomd/ui': patch
---

Fix React error #130 caused by Vite 8/Rolldown auto-splitting vendor deps into 130+ micro-chunks, producing broken cross-chunk default export resolution. Restored a correct pnpm-aware `manualChunks` implementation that consolidates all vendor deps into a stable `vendor` chunk and isolates the 3 MB Molstar library into its own `vendor-molstar` chunk. MolstarViewer is lazily imported in SingleJobPage and PublicJobPage to ensure it loads on demand.
