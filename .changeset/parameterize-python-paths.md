---
'@bilbomd/worker': patch
---

Replace hard-coded Python binary paths with configurable environment variables. `OPENMM_PYTHON_BIN` (default: `/opt/envs/openmm/bin/python`) and `BASE_PYTHON_BIN` (default: `/opt/envs/base/bin/python`) can now be set to override paths without rebuilding the container.
