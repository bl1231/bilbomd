---
'@bilbomd/mongodb-schema': patch
'@bilbomd/bilbomd-types': patch
---

Remove md_engine from base job schema for scoper jobs. Scoper uses KGSRNA for
conformational sampling, not CHARMM or OpenMM. Moving md_engine to only the
discriminator schemas that use an MD engine (pdb, crd, auto, alphafold, sans).
Also adds md_engine explicitly to the SANS discriminator schema where it was
previously relying on the base schema default. The md_engine field is now
optional in BaseJobDTO and AnonJobResponse.
