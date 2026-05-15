---
'@bilbomd/worker': minor
---

Add structured start/completed log messages with job UUID to all pipeline steps.

Every step now emits `Starting <step> for job <uuid>` and `Completed <step> for job <uuid>` to the worker log, making it straightforward to extract per-step timing from log files. Steps covered: OpenMM minimize/heat/MD, CHARMM minimize/heat/MD, FoXS, MultiFoXS, pdb2crd, pae2const, autorg.

Also adds `tools/parse_job_timing.py` — a standalone Python script (no dependencies) that parses the winston JSON worker log and reports a timing breakdown for a given job UUID, including OpenMM platform detection and MD simulation speed.
