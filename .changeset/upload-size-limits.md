---
'@bilbomd/backend': patch
---

Enforce upload limits while requests stream instead of after files land on disk. All multer uploads now go through a shared `createUpload()` factory with per-file (120 MB, 2 MB for AutoRg), file-count, and field limits; oversize files return 413 and the job directory is cleaned up on any upload error. JSON/urlencoded body limits drop from 150 MB to 1 MB since uploads are multipart.
