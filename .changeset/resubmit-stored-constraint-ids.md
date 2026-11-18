---
'@bilbomd/bilbomd-types': patch
'@bilbomd/ui': patch
---

Fix resubmit: starting from a job's stored constraints showed "Unknown field(s): _id". `inputFromStored` now drops the `_id`/`id` that MongoDB adds to every stored body, segment and residue range, along with the other stored metadata. Fields it doesn't recognise are still kept, so the validator still rejects them.
