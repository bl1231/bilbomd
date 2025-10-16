---
'@bilbomd/scoper': patch
---

I'm not sure how it happened, and don't have the time or wherewithall to do the forensics, but the BullMQ queue that the Scoper worker was subscribed to was `bilbomd-scoper`. It should be `scoper`. I fixed it.
Also ran into an odd issue [issue](https://github.com/conda-forge/pytorch-cpu-feedstock/issues/350) with shared `libtorch_cpu.so` and the executable stack...Ended up switching docker file to build from `ubuntu:22.04` instead of `python:3.xx-slim`
