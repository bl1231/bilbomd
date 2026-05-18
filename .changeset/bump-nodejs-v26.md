---
'@bilbomd/backend': patch
'@bilbomd/scoper': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
'@bilbomd/md-utils': patch
---

Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).
