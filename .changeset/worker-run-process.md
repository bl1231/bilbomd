---
'@bilbomd/worker': patch
---

Add a shared `runProcess` / `spawnProcess` helper for running external tools: output streamed to log files (flushed before the promise settles) and/or line callbacks, a stderr tail for error messages, TERM→KILL timeouts, AbortSignal cancellation and an optional heartbeat. `runPythonStep` is now a thin wrapper over it with an unchanged contract. OpenMM timeouts move to `config.processTimeouts` and can be overridden with `PROCESS_TIMEOUT_OPENMM_SETUP_MS` (default 1h, unchanged) and `PROCESS_TIMEOUT_OPENMM_MD_MS`; the per-run MD default rises from 2h to 4h, based on a longest observed production run of ~63 min.
