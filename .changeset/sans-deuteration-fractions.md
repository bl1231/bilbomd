---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Reject SANS submissions without valid per-chain deuteration fractions (at least one `deuteration_fraction_<chainId>` field, each 0–100, with an alphanumeric chain ID of 1–4 characters). Previously an empty set was saved, Mongoose dropped it, and the worker could never save the job again, so it sat at Submitted forever. The worker now marks a failed job Error without re-validating it, so an invalid job document can no longer block its own failure report.
