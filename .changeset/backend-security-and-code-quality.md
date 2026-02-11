---
'@bilbomd/backend': patch
---

Fix critical security vulnerabilities and improve code quality. Replace unsafe environment variable fallbacks with getEnvVar() to prevent empty JWT/session secrets. Update all console.log statements to use winston logger for consistent structured logging. Remove JWT error exposure in API responses and fix inefficient code patterns.
