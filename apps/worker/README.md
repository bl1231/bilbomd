# bilbomd-worker

Depending on where it is deployed, `bilbomd-worker` will process BilboMD jobs and run CHARMM, FoXS, and MultiFoXS or it will coordinate the running of your jobs on NERSC/Perlmutter via the SLURM queueing system.

## `bilbomd-worker` Description

`bilbomd-worker` is a simple [Typescript](https://www.typescriptlang.org/) NodeJS "worker" app that watches a BullMQ queue for incoming jobs. When a new job appears in the queue it will launch a sequence of processing tasks using CHARMM, FoXS, and MultiFoXS. The results will then be bundled up as a `results.tar.gz` file. The job progress will be updated in the main MongoDB database as well as in the BullMQ system (which uses Redis behind the scenes to store queue data). If deployed to NERSC, it will use the [Superfacility API](https://docs.nersc.gov/services/sfapi/) to submit and monitor jobs on Perlmutter.

## BilboMD processing pipeline

![BilboMD flow](scripts/bilbomd-flow.png)

## Deployment

In order to build the docker images you will need to obtain the source codes for CHARMM, BioXTAS, and OpenMPI and place them in the appropriate folders prior to running any `docker build` commands.

## Deploy via `docker compose` on Hyperion

In general, all of the build steps are performed as part of the Continuous Integration steps coordinated by GitHub Actions. If you need to build the Docker images manually do something like this:

```bash
git clone git@github.com:bl1231/bilbomd-worker.git
cd bilbomd-worker
docker build --build-arg USER_ID=$UID -t bl1231/bilbomd-worker -f bilbomd-worker.dockerfile .
```

## Deploy via Rancher/SPIN at NERSC

At the moment there are two versions of the `bilbomd-worker` needed for deploying **BilboMD** at NERSC. One version for doing the work on a perlmutter compute node and a second version that does no real "work", but is deployed to SPIN where it monitors for jobs and uses the Superfacility API to prepare and launch jobs via slurm batch scripts.

In general, all of the build steps for `bilbomd-worker` that runs on SPIN are performed as part of the Continuous Integration steps coordinated by GitHub Actions. The exact same Docekr image can be used on Hyperion and on SPIN. However, at the moment the version of `bilbomd-worker` that does the real work on Perlmutter must be built manually on a Perlmutter login node.

To build `bilbomd-perlmutter-worker` which is the podman-hpc runtime for performing the Molecular Dynamics steps on Perlmutter compute nodes use teh following commsnd. I have not yet implemented semver for teh image container versions.... just bump as you see fit.

```bash
cd bilbomd-worker
podman-hpc build --build-arg USER_ID=$UID -t bilbomd/bilbomd-perlmutter-worker:0.0.20 -f bilbomd-perlmutter-worker.dockerfile .
```

This results in a local version of the image on the specific login node you are connected to. In order to make the image availabel to all compute node you must migrate it:

```bash
docker migrate bilbomd/bilbomd-perlmutter-worker:0.0.20
```

and you can confirm that it has been migrated successfully my observing the R/O status. The migrated version will show up as R/O = true.

```bash
(nersc-python) [15:27]sclassen@login08:~/projects/bilbomd/bilbomd-worker$docker images
REPOSITORY                                   TAG                       IMAGE ID      CREATED         SIZE        R/O
localhost/bilbomd/bilbomd-perlmutter-worker  0.0.20                    4e3ef0f8d271  14 minutes ago  11.8 GB     false
localhost/bilbomd/bilbomd-perlmutter-worker  0.0.20                    4e3ef0f8d271  14 minutes ago  11.8 GB     true
```

## Authors

- Scott Classen sclassen at lbl dot gov
- Michal Hammel mhammel at lbl dot gov

## Version History

- 1.16.0 (9/10/2025)
  - Update NodeJS to v22.19.0
  - Update dependencies
  - Add `OpenMM` as 2nd option for MD steps (still testing)
- 1.15.2 (8/18/2025)
  - Update NodeJS to v22.18.0
  - Update dependencies
- 1.15.1 (7/28/2025)
  - Consolodate `pdb-to-crd.ts` and `pdb-to-crd-nersc.ts` functionality to support
    new PAE Jiffy on NERSC/SPIN.
- 1.15.0 (7/28/2025)
  - Move the Alphafold PAE to const.inp functionality to the worker code base.
- 1.14.10 (7/7/2025)
  - Fix export of best model scattering profile for BilboMD SANS
- 1.14.9 (6/9/2025)
  - Add BullMQ heartbeat functionality to the SANS pipeline.
- 1.14.8 (6/6/2025)
  - Updates to `pdb2crd.py` to properly patch protein chains with glycosylations present
    on the CTER.
  - Merge GA-SANS fix `#588`
- 1.14.7 (6/5/2025)
  - Updates to `pdb2crd.py` to properly patch phosphorylated SER, THR, and TYR residues
    The previous `1.14.3` was not doing this properly.
- 1.14.5 (6/5/2025)
  - Reduce BullMQ lockDuration and adjust long-running steps to periodically update
    BullMQ to keep the lock alive. This will hopefully help with job recovery when a
    worker crashes and we need to restart services.
- 1.14.4 (6/3/2025)
  - Fix bug in `pdb2crd.py` with HETATM not getting replaced with ATOM
- 1.14.3 (6/2/2025)
  - Update dependencies
  - Add support for phosphorylated Serine, Threonine, and Tyrosine
- 1.14.2 (5/12/2025)
  - Fix bugs introduced by moving from `build` to `dist`
  - Add better `rg_min` calculation for SAXS datasets with "low" Rg values.
  - Fixed bug with the way we passed d2o fraction to PEPSI-SANS
- 1.14.1 (5/9/2025)
  - Upgrade dependencies
  - Add `vitest` testing framework
  - Switch from `build` to `dist` for transpiled code
- 1.14.0 (4/10/2025)
  - Upgrade from Express v4 to v5
  - Refactor NERSC job monitoring code
- 1.13.0 (3/31/2025)
  - Improve the NERSC worker logic
- 1.12.6 (1/9/2025)
  - Calculate model molecular weight (MW) from initial PDB model.
- 1.12.5 (1/7/2025)
  - Update dependencies
- 1.12.4 (12/11/2024)
  - Refactor `prepareResults` for BilboMD SANS
  - Improve README for BilboMD SANS
  - Update dependencies
- 1.12.3 (12/06/2024)
  - Bump dockerfile from node20 to node22
  - Syncronize changes to `pae_ratios.py` from `bilbomd-backend`
- 1.12.2 (12/04/2024)
  - Update dependencies
  - Run `npm audit fix`
- 1.12.1 (11/22/2024)
  - Refactor src/workers/bilboMdNerscJobMonitor.ts to prevent multiple emails sent.
- 1.12.0 (11/21/2024)
  - Add BilboMD Multi pipeline
- 1.11.2 (11/20/2024)
  - Fix PAE Jiffy bug preventing it from working as expected.
- 1.11.1 (11/19/2024)
  - Return `minimization_output_$datfileprefix.dat` in results.tar.gz file
  - Update several dependencies
- 1.11.0 (11/15/2024)
  - Add a PDB remediation step to non-NERSC pipelines
- 1.10.1 (11/13/2024)
  - Update job progress in Mongo Job entry for all non-NERSC jobs
- 1.10.0 (11/08/2024)
  - Decouple job submission from job monitoring on NERSC
  - Add the step to calculate Rgyr vs. Dmax consolodated json file
- 1.9.4 (11/04/2024)
  - Simplify package name from `bilbomd-worker/bilbomd-worker` to `bilbomd-worker`
- 1.9.3 (11/04/2024)
  - Changes required to migrate from CJS to ESM
- 1.9.2
  - Update dependencies
- 1.9.1
  - Add feedback analysis sub-step for BilboMD Classic PDB (others will be added later)
- 1.9.0
  - Add BilboMD SANS capabilities
  - Refactor BullMQ worker code to make it more modular
- 1.8.1
  - Increase monitorJobAtNERSC polling to 24 hours at 1 min intervals
- 1.8.0
  - Add worker functions to process BilboMD AF (AlphaFold) jobs
- 1.7.0
  - Remove `bilbomd-spin-worker`
  - Add an API endpoint to deliver config info
  - Improvements to CI/CD workflow
- 1.6.7
  - Unified Docker image for both beamline and NERSC SPIN deployment
- 1.6.6
  - Add BioXTAS RAW & IMP to docker image.
  - Additional changes so we can eventually have a single Docker image for SPIN and beamline deployment
  - Fix & refactor the `pae_ratios.py` script to deal with adjacent Rigid Domains.
- 1.6.5
  - Fix bug with PAE Jiffy when replacing DNA residues
  - Install Python and CHARMM into `bilbomd-spin-worker` Docker image
- 1.6.4
  - Dependency updates
  - Implement GitHub Actions CI workflows
  - Better job-handling logic for NERSC Jobs
- 1.6.3
  - Add steps object to mongodb entry
  - Some improvements to logging
- 1.6.2
  - Use @bl1231/bilbomd-mongodb-schema
  - Update dependencies
  - Update README
- 1.6.1
  - A fair number of changes for NERSC deployment.
- 1.6.0
  - Extensive changes to `pdb2crd.py` in order to preserve incoming residue numbering.
  - Refactor for the changes in `pdb2crd.py`
  - Create one `CRD` file per chain then combine before running the rest of the BilboMD pipeline.
  - Make sure original files are included in `results.tar.gz` file
  - Create `results.tar.gz` files with unique names (e.g. `results-2ff9f312.tar.gz`)
- 1.5.5
  - Fix bug in `pdb2crd.py` script for substituting CHARMM residues names in DNA.
  - Update dependencies
- 1.5.4
  - Sync `pae_ratios.py` script with `bilbomd-backend`.
- 1.5.2
  - Changes to allow PDB files for BilboMD Classic
- 1.5.1
  - Changes to allow PDB files for BilboMD Auto
- 1.5.0
  - Mainly changes to allow building and deploying on local laptop and NERSC SPIN.
- 1.4.0
  - Add new functions for converting PDB to CRD and PSF.
  - Enforce Python style guidelines with Black.
  - Add `pdb2crd.py` script for creating the CHARMM input file for PDB to CRD.
- 1.3.1
  - Close fs streams properly so we don't have dangling NFS lock files.
- 1.3.0
  - Add new functions to run `FoXS` analysis on initial PDB for BilboMD classic/auto
- 1.2.9
  - Add a README file to all `results.tar.gz` files explaining the contents.
- 1.2.8
  - Fix bug when `rg_min` and `rg_max` are too close.
- 1.2.7
  - Update dependencies
- 1.2.6
  - Synchronize `mongoose` schema files with other BilboMD codes
- 1.2.5
  - Change all CHARMM bomlev values to `-2``
- 1.2.4
  - Upgrade mongoose from 7.6.3 to 8.0.2
- 1.2.3
  - add the hidden `-o` option for all `multi_foxs` runs
- 1.2.2
  - update `pae_ratios.py` script
- 1.2.1
  - Small change to logging messages
- 1.2.0
  - Refactor bilbomd function code
  - Add single `handleError` function
  - improve error handling logic
- 1.1.0
  - Rewrite gatherResults
  - Return single PDB file for each MultiFoXS ensemble
- 1.0.0
  - Start using Ubuntu for Docker build
  - IMP 2.19.0
- 0.0.12
  - Add BilboMDAuto job type (experimental and untested!)
- 0.0.11
  - bump nodejs to 18.18.0
- 0.0.10
  - Remove the `-r` option from FoXS in `spawnFoXS` function.
- 0.0.9
  - add job title to emails
