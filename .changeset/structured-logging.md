---
'@bilbomd/backend': minor
'@bilbomd/worker': minor
'@bilbomd/scoper': minor
---

Add structured logging with JSON file output and request context propagation.

File transports now emit JSON for machine-parseable log ingestion (Loki, Elasticsearch, etc.). Console output remains colorized human-readable text.

Backend gains `AsyncLocalStorage`-based request context: every log line within an HTTP request automatically includes `requestId` without threading `req` through callers. Key controller call sites migrated from string interpolation to structured object fields.
