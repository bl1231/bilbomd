---
'@bilbomd/backend': minor
---

Remove the await waitForJobCompletion and the code that sets newJob.psf_file/crd_file and saves.
Just fire off queuePdb2CrdJob and log the BullMQ ID.
