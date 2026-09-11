---
'@bilbomd/worker': patch
---

Force `podman-hpc run` to use `slirp4netns` networking in all NERSC Slurm generators. The default `pasta` helper intermittently fails its netlink handshake on Perlmutter compute nodes (`pasta failed with exit code 1: netlink: Unexpected sequence number`), which made `srun` exit 126 and caused the batch script to cancel the whole job at a random step. Fixes #1022.
