---
'@bilbomd/ui': minor
---

Inp Jiffy: the Preview step now draws the fixed and rigid bodies the way the job form and job page do, checks them the way BilboMD will, and offers both a const.inp and an openmm_const.yml download, with the file texts in collapsed sections. Step 2 calls the bodies fixed, rigid and flexible, and step 1 shows the example as both a const.inp and an openmm_const.yml. The Inp Jiffy and the PAE Jiffy each get a "Use in a new Classic job" button, which opens a new BilboMD Classic job with the structure and constraints already picked.
