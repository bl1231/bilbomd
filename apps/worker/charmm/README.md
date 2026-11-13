# CHARMM source

The published worker images (`bilbomd-worker-base`, `bilbomd-worker`) do not
contain CHARMM. Images that need it are built on the host that runs them, from
a CHARMM source tarball placed in this directory:

| Image                       | Dockerfile                             | Built by                                              |
| --------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `bilbomd-worker-charmm`     | `bilbomd-worker-charmm.dockerfile`     | the epyc compose files, on `deploy-to-beamline.sh up` |
| `bilbomd-perlmutter-worker` | `bilbomd-perlmutter-worker.dockerfile` | `podman-hpc build` on Perlmutter                      |

To get the source:

- Register at [academiccharmm.org](https://academiccharmm.org/); they email
  download instructions.
- Copy the tarball here as `<version>.tar.gz` (currently `c49b2.tar.gz`, set by
  `CHARMM_VER` in the Dockerfiles).

`*.tar.gz` in this directory is gitignored. Never commit it, and never push an
image built from it to a registry.
