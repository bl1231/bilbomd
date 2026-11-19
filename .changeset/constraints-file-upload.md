---
'@bilbomd/ui': minor
---

Replace the inline constraints editor on the BilboMD Classic, SANS and resubmit forms with a constraints file upload (const.inp, OpenMM constraints YAML, or bilbomd_job.json), linking to the Inp Jiffy and PAE Jiffy for making one. The file is read in the browser and checked against the structure once both files are selected; the constraints are then drawn the way the job page shows them. A file with parts that would be left out is refused rather than partly used. On resubmit, the original job's constraints are shown read-only and can be replaced with a file.
