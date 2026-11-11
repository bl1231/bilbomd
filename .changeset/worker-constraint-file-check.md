---
'@bilbomd/worker': patch
'@bilbomd/bilbomd-types': patch
---

The worker now checks a job's CHARMM constraint file right before CHARMM reads it: before the heat and MD steps, and before a NERSC job's Slurm file is made. Every line must start with one of the commands the job forms already allow (`define`, `cons fix`, `cons harm`, `shape desc`, `return`, comments and titles), and the file name must be a plain name. Otherwise the step fails with a message naming the line. The backend already checks uploads; this covers the file the worker actually uses, whatever path the job took to the queue.

`@bilbomd/bilbomd-types` exports the keyword check as `findDisallowedConstInpLine`, and `checkConstInpText` uses it. Both now split lines on CR as well as LF and CRLF, so a bare carriage return can't hide a line from the check.
