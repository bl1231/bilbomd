---
'@bilbomd/ui': patch
---

Fix React error #130 caused by Vite 8 auto-split bundling MolstarViewer and BilboMDScoperTable into a shared chunk with a broken default export boundary. MolstarViewer is now lazily imported in SingleJobPage and PublicJobPage, giving it its own isolated 3.2 MB chunk loaded on demand.
