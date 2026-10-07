---
'@bilbomd/worker': patch
---

NERSC CRD jobs now apply their uploaded constraint file. The CHARMM generator hardcoded `const.inp`, so CHARMM could not open the user's file (for example `example-const.inp`), only warned under `bomlev -2`, and ran heat and MD without constraints while the job still reported Success. The generator now uses `const_inp_file` from `params.json` for CRD and PDB jobs and fails at prep time if that file is missing. Auto and AlphaFold jobs keep the `const.inp` written by `pae2const.py`.
