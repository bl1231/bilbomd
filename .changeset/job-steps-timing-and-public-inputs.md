---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': minor
---

Job step types now include each step's start time, finish time and duration, plus the steps they were missing (openfold, reduce, rnaview, kgs, ionnet, scoper). The public job status response now also returns the job title and a whitelisted set of inputs (input file names, MD parameters, Rg range and so on), which the redesigned job page will use. No user details are exposed.
