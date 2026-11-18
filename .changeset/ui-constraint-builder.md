---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': patch
---

The Classic (PDB and CRD/PSF), SANS and resubmit forms no longer upload a `const.inp`. A new constraints editor reads the chosen structure file in the browser, using the same readers as the server. It edits one fixed body and up to 20 rigid bodies as segments with residue ranges or whole segments. Constraints are checked with the server's own validator as you edit, and CHARMM jobs show a preview of the `const.inp` BilboMD will write. The form submits them as JSON in the `constraints` field.

An existing `const.inp` can still be used as a starting point. It is read in the browser and its text is never sent: segids are matched to the structure's chains, anything other than defines, `cons fix` and `shape desc` is reported and left out, and a file with several `cons fix` commands asks which one is the fixed body. Resubmit starts from the original job's constraints. For older CRD/PSF jobs it reads the original `const.inp` instead.

`importConstraintsFromConstInp` takes an optional `structure`, used to match segids to chains in PDB mode.
