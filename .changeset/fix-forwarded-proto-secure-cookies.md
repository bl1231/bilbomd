---
'@bilbomd/ui': patch
---

Fix the UI nginx clobbering `X-Forwarded-Proto` so `Secure` session cookies work behind a TLS-terminating proxy. The inner nginx listens on :80 and previously forwarded `X-Forwarded-Proto: $scheme` (always `http`), so the backend saw `req.secure === false` and express-session silently dropped the `Secure` `bilbomd-session` cookie — breaking the cookie-based auth used for MD movie/poster streaming on HTTPS deployments (beamline via Cloudflare and NERSC/SPIN via the nginx ingress). nginx now preserves the real upstream protocol (falling back to `$scheme` for direct/local HTTP), so `Secure` cookies can be used without the `COOKIE_SECURE=false` workaround. See issue #911.
