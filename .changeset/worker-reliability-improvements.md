---
'@bilbomd/worker': patch
---

Improve worker reliability and error handling. Add graceful shutdown handling for SIGTERM/SIGINT signals to properly close workers and Redis connections. Implement connection retry logic for MongoDB (5 attempts with 5s delay) to handle transient connection failures. Add startup validation for required environment variables to fail-fast on misconfiguration. Include multimdWorker in pause/resume logic for NERSC token validation. Make error throwing explicit in all job handlers (bilboMd, multiMd, movie) to ensure BullMQ correctly marks failed jobs. Add comprehensive test coverage for config validation and worker handlers.
