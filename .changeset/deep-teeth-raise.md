---
'@bilbomd/scoper': patch
---

Split docker build into 2: base imafge and main image.
This should speed up subsequent GitHub Actions workflows that are building the main scoper image
