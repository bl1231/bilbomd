---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': patch
'@bilbomd/ui': minor
---

The job forms now run two structure checks that only the backend ran before, so users see these problems when they pick their files instead of after they submit:

- A PDB with residues that share a chain and residue number (for example, a glycan numbered inside the protein's range) is rejected, with the same message as the backend. This applies to the Classic, Auto and SANS forms.
- On the Auto form (new and resubmit), a PAE matrix whose size doesn't match the structure's residue count is rejected, with the same message as the backend. Each PAE and structure file is read and parsed once, not on every form change.

The residue counting, PAE parsing and both messages moved from the backend into `@bilbomd/bilbomd-types`, so the form and the backend use the same code.
