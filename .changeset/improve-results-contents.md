---
'@bilbomd/worker': patch
---

Improve results.tar.gz contents across standard, SANS, and Multi pipelines.

- Copy `consolidated_rgyr_dmax_data.json` and `multi_foxs.log` into results for all standard pipelines (PDB, CRD, Auto, AlphaFold, OpenFold)
- Fix SANS minimized PDB lookup to use the same three-path fallback as standard pipelines (OpenMM → new CHARMM layout → legacy root)
- Add minimized PDB DAT file to SANS results
- Include the primary SAXS data file and `multi_foxs.log` in Multi results
