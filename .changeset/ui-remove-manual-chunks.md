---
'@bilbomd/ui': patch
---

Remove broken manualChunks configuration and let Vite 8 handle automatic code splitting. The previous manualChunks function collapsed all pnpm dependencies into a single 4.7MB chunk; automatic splitting now correctly defers the large Molstar library to a lazy chunk loaded only when viewing job results.
