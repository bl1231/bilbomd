---
'@bilbomd/mongodb-schema': patch
'@bilbomd/worker': patch
---

Fix worker 2.22.0 failing every job with "Operation `jobs.findOne()` buffering timed out". Its new Kubernetes client brought in `socks`, an optional peer of `mongodb`, so the worker and `@bilbomd/mongodb-schema` got two copies of mongoose and the models were registered on the one the worker never connected. `@bilbomd/mongodb-schema` now takes mongoose as a peer dependency, so its models always use the app's mongoose.
