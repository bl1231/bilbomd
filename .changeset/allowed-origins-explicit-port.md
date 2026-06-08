---
'@bilbomd/backend': patch
---

Avoid deriving an invalid CORS origin when `BILBOMD_URL` already includes an explicit port. Previously the allowed-origins list always appended `:BILBOMD_UI_PORT`, producing junk entries like `http://localhost:3001:3001` for no-proxy installs that set `BILBOMD_URL=http://localhost:3001`. The port is now only appended when `BILBOMD_URL` has no port of its own.
