---
'@bilbomd/bilbomd-types': minor
'@bilbomd/md-utils': patch
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Share the structure and constraint file checks between the job forms and the backend upload validation, so a file the form accepts is one the backend accepts too. The checks now live in `@bilbomd/bilbomd-types` (`structureFileChecks.ts`).

Behaviour that now matches on both sides:

- Constraint files accept only `shape desc` lines (the form used to accept any `shape` line), and the backend now enforces the form's limit of 20 shape commands.
- The form no longer reports a lowercase residue name as supported, and no longer flags a blank residue name.
- Only `MODEL` records count as models in the form, not other lines starting with `MODEL`.
- The form now checks an empty structure or constraint file (and one that cannot be read) instead of passing it.
