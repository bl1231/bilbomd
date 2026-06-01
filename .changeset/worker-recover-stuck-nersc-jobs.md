---
'@bilbomd/worker': patch
---

Recover NERSC jobs stuck at "Submitted" that were submitted before the nersc
persistence fix. The monitor now reconstructs the missing `nersc` sub-document
from the successful submission step (parsing the NERSC JobID from the step
message) so these jobs resume status tracking (#858).
