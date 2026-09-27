---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Enforce upload limits while requests stream instead of after files land on disk. All multer uploads now go through a shared `createUpload()` factory with per-file (120 MB, 2 MB for AutoRg), file-count, and field limits; oversize files return 413 and the job directory is cleaned up on any upload error. JSON/urlencoded body limits drop from 150 MB to 1 MB since uploads are multipart.

The unauthenticated `POST /autorg` and `POST /af2pae` endpoints are now rate limited (20 requests per 10 minutes per IP, each endpoint counted separately).

Raise the UI nginx `/api` body limit (80M → 140M) and the Helm ingress `proxy-body-size` (100m → 140m) so AlphaFold submissions with PAE files up to the 120 MB validation limit are no longer rejected by the proxies.
