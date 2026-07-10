---
'@bilbomd/worker': patch
---

Add Python tests to the CI pipeline. The worker image now bundles `pytest` in its OpenMM environment so the image is self-testable, and CI gains two gated jobs: a fast "Python tests (light)" job for the OpenMM-free tests (tools/python + stdlib worker scripts) and a "Worker Python tests (in image)" job that runs the OpenMM-dependent tests inside the built worker image. Pytest configuration is centralized in a root `pyproject.toml`, and OpenMM-dependent tests self-skip where the stack is unavailable.
