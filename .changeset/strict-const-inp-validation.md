---
'@bilbomd/bilbomd-types': patch
---

Security: check every command in a CHARMM constraint (const.inp) file in full, not just how it starts. Each command must now be one of `define <name> sele … end`, `cons fix sele … end`, `cons harm … sele … end`, `shape desc <name> rigid sele … end` or `return`. Selections may use only the characters CHARMM selections need, with exactly one `end`, which must come last. Title lines are limited to plain text. This blocks `system`, `stream` and file I/O commands hidden after a valid command (`end; system "…"`) or joined on with a `-` continuation, plus `@`/`?` substitution tricks. The UI form, the backend upload check and the worker's pre-CHARMM guard all use this check.
