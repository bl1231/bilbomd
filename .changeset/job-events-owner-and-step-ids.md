---
'@bilbomd/bilbomd-types': patch
'@bilbomd/worker': patch
---

Fix two job-event bugs found on Spin dev. Anonymous jobs were published with an owner id of `"{}"` instead of none: their `user` is an empty nested object, which `jobEventOwnerId` stringified. It now accepts only a real 24-character ObjectId. And the NERSC job monitor published an event for every NERSC job on every pass, because rewriting a step with unchanged content gives it a new subdocument `_id`. Change detection now compares only each step's status and message.
