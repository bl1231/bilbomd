---
'@bilbomd/scoper': patch
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Failed SCOPER jobs are now marked Error instead of staying "Running" forever. The scoper reports failures from the BullMQ `failed` event, using the attempts the backend enqueued the job with. It marks the step it stopped in, records `job_failed` and emails the owner. SCOPER uploads with more than one model (e.g. NMR ensembles, which KGSrna can't read) are now rejected at submit time.
