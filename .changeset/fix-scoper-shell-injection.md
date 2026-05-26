---
'@bilbomd/scoper': patch
'@bilbomd/backend': patch
---

Fix OS command injection vulnerability in scoper worker and add filename validation.

The scoper's `runFoXS` function used `exec()` with a shell-interpolated template literal to copy files, allowing shell metacharacters in user-supplied filenames to execute arbitrary commands. Replaced with `fs.copyFile()` which never invokes a shell.

Added `noShellMetacharsTest` filename validator to the backend validation helpers and a new `scoperJobSchema` that applies it to PDB and DAT file uploads, rejecting filenames containing `;`, `&`, `|`, backticks, `$`, `<`, `>`, `(`, `)`, `{`, `}`, or `!` before the job is queued.
