# bilbomd-scoper

## Description

This project supports the Scoper/IonNet pipeline. Scoper is a novel pipeline that uses a combination of classical algorithms and deep-learning techniques to find structures, along with magnesium ion binding sites that fit a given SAXS profile, given an initial structure to work with. A novel deep neural network was created for this pipeline which we named IonNet. IonNet is used to predict magnesium binding sites for RNA structures.

## Docker stuff

### build Docker container

This command mimics what happens during the GitHub Actions when teh image is built for production deployment.

```bash
docker build -t bl1231/bilbomd-scoper -f bilbomd-scoper.dockerfile --build-arg USER_ID=$(id -u) --build-arg GROUP_ID=$(id -g) --build-arg GITHUB_TOKEN="${GITHUB_TOKEN}" .
```

Or maybe just build up to a specific stage:

```bash
docker build --target build-stage-1 -t bilbomd-scoper-stage-1 .
```

### Run Docker container with pwd mounted into container

These are a few iterations of `docker run` commands I have usde during development.

```bash
docker run -d -p 3005:3005 -v .:/home/bun/app --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 --gpus all -v .:/home/bun/app --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 --gpus all -v .:/home/bun/app -v /home/classen/projects/IonNet:/home/bun/app/test-data/IonNet --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 -v .:/home/bun/app -v /home/classen/projects/IonNet:/home/bun/IonNet --name bilbomd-scoper bilbomd-scoper
```

As it turns out the `KGSrna` binary distributed with `IonNet` only runs on Intel processors, and attempting to run on `epyc.bl1231.als.lbl.gov` (with an AMD epyc processor) resulted on core dumping.

### Run daemonized Docker container with internal app directory

```bash
docker run -d -p 3005:3005 --gpus all --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 --name bilbomd-scoper bilbomd-scoper
```

### Launch an interactive Docker container terminal

```bash
docker exec -it bilbomd-scoper bash
```

### Stop and Remove Docker container

```bash
docker stop bilbomd-scoper
docker rm bilbomd-scoper
```

## Version History

- 1.2.2 (4/17/2025)
  - Fix bug with processing filenames having multiple `.`s
- 1.2.1 (12/05/2024)
  - Bump NodeJS to v22
  - Update to many npm packages
  - Migrate to new eslint v9
  - Migrate from CommonJS to ES
- 1.2.0 (11/14/2024)
  - GitHub actions now builds docker image automatically
  - Docker image built on python:3.10-slim to reduce size
- 1.1.2 (11/13/2024)
  - Allow user to fix c1/c2 values used in the `multifoxs_combination` step
  - Update progress in top level Mongo Job entry
- 1.0.6
  - Peg `pyg` at version 2.4.0
  - Bump `nodejs` from 20.12.2 to 20.15.0
  - Use `bilbomd-mongodb-schema` library
  - Downgrade `IMP` from 2.20.1 to 2.19.0 for now
  - Added logging module & replaced some `console.log()` statements
  - Removed reference to `/home/bun`
  - Improve `Dockerfile`
  - Add a `config.ts` file
  - Started to reorganize the directory structure similar to `bilbomd-worker`
  - Copied `tsconfig.ts` from `bilbomd-worker`
- 1.0.5
  - Update dependencies.
- 1.0.4
  - Update dependencies.
  - Refactor the `Dockerfile`
- 1.0.3
  - Add a README file to each `results.tar.gz` file.
- 1.0.2
  - Update dependencies
- 1.0.1
  - add runtime params (`--min_c1=0.99 --max_c1=1.05 --min_c2=-0.5 --max_c2=2.0`) to `FoXS`
- 1.0.0
  - Add ability to run `FoXS` on results
  - Might as well make this verion 1.0.0 since it seems to work on our test RNAs
- 0.0.4
  - Add the `-u` flag for Python spawn of `mgclassifierv2.py`.
    This should allow the `scoper.log` file to present better incremental information.
- 0.0.3
  - Fix the Mg and HETATM spacing in final PDB file
- 0.0.1
  - Initial working version of Scoper/IonNet pipeline
