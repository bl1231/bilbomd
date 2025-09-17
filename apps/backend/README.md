# bilbomd-backend

Provides backend support for bilbomd-ui

## Description

`bilbomd-backend` provides authentication and authorization functionality for the `bilbomd-ui` front end application. It also provides several API functionalities for authentication, user creation/editing, and BilboMD job creation. The `bilbomd-backend` also provides an interface to MongoDB which provides a persistant store for User and Job records. The `bilbomd-backend` server also mediates the addition of BilboMD jobs to the BullMQ queueing system. BilboMD jobs are then processed exclusively by `bilbomd-worker`s.

## Getting Started

### Technologies Used

- [![NodeJS][NodeJS]][NodeJS-url]
- [![MongoDB][MongoDB]][MongoDB-url]
- [![ExpressJS][ExpressJS]][ExpressJS-url]
- [![Docker][Docker]][Docker-url]
- [![Redis][Redis]][Redis-url]
- [![BullMQ][BullMQ]][BullMQ-url]

### Installing

`bilbomd-backend` is most easily installed via docker compose as a docker container along side the redis and mongodb containers. Please see the `bilbomd` [instructions](https://github.com/bl1231/bilbomd)

### Instructions for installing a develoment instance of the backend

Clone the repo.

```
cd /wherever/this/will/live
git clone https://github.com/bl1231/bilbomd-backend
```

Install the Node.js dependencies for testing purposes, but keep in mind that these will be installed **inside** the Docker container when you run `docker compose build` from the `bilbomd` [main project](https://github.com/bl1231/bilbomd).

```
npm install
```

### Run tests

```bash
npm run test
```

### Run program

Production is run via docker compose. However, for interactive local development efforts you might be able to:

```bash
npm run dev
```

However, `bilbomd-backend` needs to communicate with Redis and MongoDB which are typically running in separate Docker images so you would likely have to fiddle with PORT values etc. in order to run in "dev" mode within a local terminal. It will be much easier to use docker compose and develop directly within the `bilbomd-dev` environment. Details can be found in `bilbomd` repo. Briefly, the entry point for the `backend` service in `bilbomd-dev` has been set as:

```
command: [ "npm", "run", "dev" ]
```

and the local directory has been mounted inside the docker image:

```
    volumes:
      - ./bilbomd-backend:/app
```

This makes it so that `bilbomd-backend` will automatically restart inside the docker image anytime changes are made to source files.

## Build docker image

To test if the `Dockerfile` will build you can use this command:

```bash
docker build --build-arg USER_ID=1001 --build-arg GROUP_ID=1001 -f bilbomd-backend.dockerfile
```

or if using `podman-hpc` on perlmutter...

```bash
podman-hpc build --build-arg USER_ID=$UID -t bl1231/bilbomd-spin-backend -f bilbomd-spin-backend.dockerfile
```

Then you need to tag and push in order for it to be available to Helm/SPIN.

```bash
podman-hpc login registry.nersc.gov
podman-hpc tag bl1231/bilbomd-spin-backend:latest registry.nersc.gov/m4659/sclassen/bl1231/bilbomd-spin-backend:latest
podman-hpc push registry.nersc.gov/m4659/sclassen/bilbomd-spin-backend:latest
```

## Authors

- Scott Classen sclassen at lbl dot gov
- Michal Hammel mhammel at lbl dot gov

## Version History

- 1.22.0 (9/10/2025)
  - Add ability to handle new `md_engine` property to switch between `CHARMM` and `OpenMM`
- 1.21.1 (8/18/2025)
  - Update nodejs to v22.18.0
  - Update dependencies
- 1.21.0 (7/28/2025)
  - Refactor PAE Jiffy with a submit & poll strategy
  - Added much of the OAuth functionality
- 1.20.6 (7/10/2025)
  - Add a validation check for SAXS data Rg values for BilboMD AF job submission
- 1.20.5 (6/16/2025)
  - Updates to API test scripts
- 1.20.3 (6/5/2025)
  - Refactor Redis connection to keep code DRY
  - Improve BullMQ state info passed to frontend DataGrid
- 1.20.2 (6/2/2025)
  - Update dependencies
- 1.20.1 (5/13/2025)
  - Add better `rg_min` calculation for SAXS datasets with "low" Rg values.
- 1.20.0 (5/8/2025)
  - Add dedicated BullMQ queue for deleteing BilboMD jobs
  - Some refactoring of swagger API documentation
- 1.19.4 (5/6/2025)
  - Refactor the Admin panel
  - Add better BullMQ Queue monitoring and control
  - Fix bug in `getConfigsStuff` that would prevent the ui from loading when workers were unresponsive to axis.get
- 1.19.3 (5/2/2025)
  - Fix bug in BilboMD Classic job handler when user switches job mode from PDB to CRD/PSF
    and visa versa.
- 1.19.2 (4/30/2025)
  - Fix the broken resubmit functionality
- 1.19.1 (4/29/2025)
  - Refactor new job route handles to not require email in `req.body`
- 1.19.0 (4/28/2025)
  - Add external API endpoints to enable job submission. monitoring, and results download.
- 1.18.1 (4/17/2025)
  - Fix bug with Scoper FoXS analysis processing filenames having multiple `.`s
- 1.18.0 (4/16/2025)
  - Adds new endpoints and refactors several backend controllers for job resubmission and management.
  - Reorganized job controller exports to a separate directory.
  - Updated imports across routes and controllers.
- 1.17.0 (4/11/2025)
  - Add new API endpoint for BilboMD statistics
- 1.16.7 (4/10/2025)
  - Bump ExpressJS from v4 to v5
  - Update npm dependencies
- 1.16.6 (3/31/2025)
  - forgot to bump schema dep
- 1.16.5 (3/31/2025)
  - Update dependencies
  - Bump `@bl1231/bilbomd-mongodb-schema@1.5.0`
- 1.16.4 (3/24/2025)
  - Add config option to hide/show main login alert message
- 1.16.3 (3/12/2025)
  - Fix file download bug affecting Scoper jobs
- 1.16.2 (1/10/2025)
  - Add `deploySite` env variable to config
- 1.16.1 (1/7/2025)
  - Track job submission stats for each user
  - Refactor and Cleanup to handle UI changes
- 1.16.0 (12/16/2024)
  - Add new file download API needed for `bilbomd-ui` `v1.17.0`
- 1.15.2 (12/11/2024)
  - Add `rg` to BilboMD SANS jobs.
- 1.15.0 (12/06/2024)
  - Update af2paeController to handle new PAE Fiffy with a slider to control
    pLDDT cutoff value used by `par_ratios.py`
- 1.14.2 (12/04/2024)
  - Update dependencies
  - Run `npm audit fix`
- 1.14.1 (11/22/2024)
  - Add config option to enable/disable BilboMD Multi
- 1.14.0 (11/21/2024)
  - Add BilboMD Multi pipeline
- 1.13.2 (11/15/2024)
  - Adjustments to jobHandler code for PDB remediation step
- 1.13.1 (11/12/2024)
  - Add new option for Scoper jobs to fix c1/c2 values
- 1.13.0 (11/08/2024)
  - Add `rg`, `rg_min`, and `rg_max` to all Auto and AF jobs
- 1.12.9 (11/04/2024)
  - Simplify package name from `bilbomd-backend/bilbomd-backend` to `bilbomd-backend`
- 1.12.8
  - Now adding Rg to mongo Job entries
  - Update dependencies
- 1.12.7
  - Improvements to the email reset workflow
- 1.12.6
  - Fix problem with nodemailer templates
- 1.12.5
  - Filter jobs returned to non-admin users
- 1.12.4
  - Fix bug in mailer
- 1.12.3
  - Fix Docker compose healthcheck
- 1.12.2
  - Update dependencies
  - Add new API endpoints for User Account functionality
- 1.12.0
  - Add BilboMD SANS backend capabilities
  - Improve the step status granularity
  - Add scaffolding for Python testing
  - Refactor autorg.py to write results to a temporary file
- 1.11.1
  - Add sanitizing function for user uploaded `const.inp` files to ensure no lines longer than 78 characters.
- 1.11.0
  - Add API endpoint to handle BilboMD AF jobs
- 1.10.2
  - Add API endpoint to provide Perlmutter outage information
- 1.10.1
  - Update dependencies
  - Various Typescript fixes
- 1.10.0
  - Remove `bilbomd-spin-backend`
  - Improve the API endpoint to deliver config info for backend. worker, and ui
  - Improvements to CI/CD workflow
- 1.9.8
  - Unified Docker image for both beamline and NERSC SPIN deployment
- 1.9.7
  - Add API endpoint to deliver config info (e.g. dev/prod, useNersc, repo, etc.)
  - Fix & refactor the `pae_ratios.py` script to deal with adjacent Rigid Domains.
- 1.9.6
  - Implement GitHub Actions to build docker images
  - Add API endpoints for SF-API expiration date
  - Bump ESLint to v9.x
  - Return GPU usage stats from NERSC
- 1.9.3
  - Add steps object to mongodb entry
  - Some improvements to logging
- 1.9.2
  - Use @bl1231/bilbomd-mongodb-schema
  - Update dependencies
- 1.9.1
  - Add in some changes required for NERSC deployment
- 1.9.0
  - Fix for negative C1 C2 values in FoXS plots
  - Some changes to accomodate new pdb2crd numbering logic
  - Use Content-Disposition headers for results file downloads
- 1.8.5
  - OTP bug fix
  - security enhancements
  - Add OpenAPI/swagger docs for some API endpoints
- 1.8.3
  - Fix `pae_ratios.py` to accomodate the new frontend UI slider for controlling the weight value used by `igraph` `cluster_leiden()` function.
- 1.8.2
  - Changes to allow PDB files for BilboMD Classic
- 1.8.1
  - Changes to allow PDB files for BilboMD Auto
- 1.8.0
  - Mainly changes to allow building and deploying on local laptop and NERSC SPIN.
- 1.7.0
  - Enforce PEP8 Python guidelines. Set default formatter to Black.
  - Refactor `pae_ratios.py` script.
  - Add new dedicated `pdb2crd` BullMQ queue.
- 1.6.1
  - Make Job deletion more robust to NFS lock files.
- 1.6.0
  - Add routes for getting `FoXS` analysis results for BilboMD auto/classic
- 1.5.4
  - Mainly dependency updates.
- 1.5.3
  - Add information about the `scoper` queue
- 1.5.2
  - Update dependencies
- 1.5.1
  - Add `FoXS` C1 and C2 values to teh Scoper plots.
- 1.5.0
  - Add new route to retrieve `FoXS` analysis of Scoepr results.
- 1.4.3
  - Add ability to load multiple models into Molstar viewer.
- 1.4.2
  - Add route for fetching PDB files from results.
    This was needed for the `bilbomd-ui` Molstar viewer.
- 1.4.1
  - Add better status details for Scoper/IonNet jobs
    This required restructuring the `BilboMDScoperSteps` object type
- 1.4.0
  - Add new Scoper/IonNet pipeline for RNA
- 1.3.7
  - fix bug when deleting users
  - adjust the Mongoose schema
- 1.3.6
  - Upgrade mongoose from 7.6.3 to 8.0.2
- 1.3.5
  - Jest test files have been converted to Typescript
- 1.3.4
  - Remove unused CHARMM handlebars templates
- 1.3.3
  - Set defualt `conformational_sampling` to `3`
- 1.3.2
  - Bug fixes
- 1.3.1
  - update the `pae_ratios.py` script
- 1.3.0
  - Migrate most Javascript code to Typescript
- 1.2.0
  - Add new route for retrieving Log information
- 1.1.0
  - Add Job step details for new BilboMD Auto job type
  - update npm dependencies
- 1.0.1
  - Adjust admin route for new `v1` API
  - Adjust formidable maxFileSize
  - Some swagger config changes
- 1.0.0
  - Implement versioned API (start with `v1`)
  - Start out with a new major package version (`1.0.0`)
  - API will make best effort to conform to [OpenAPI 3.\*](https://swagger.io/specification/) specification.
  - Add [SwaggerUI](https://swagger.io/tools/swagger-ui/) for public facing API documentation.
- 0.0.14
  - Add AutoRg API endpoint that uses [BioXTAS RAW](https://github.com/jbhopkins/bioxtasraw) to calcualte `rg_min` and `rg_max`
- 0.0.13
  - Update the PAE Pythons script
- 0.0.12
  - Add number of Workers to the Backend BullMQ Controller
- 0.0.11
  - fix the bug where CHARMM fails when filenames have uppercase letters
- 0.0.10
  - Add BullMQ Summary routes
- 0.0.9
  - Improve Job Details page.
  - Add function to gather status for each BilboMD step.
  - Update all npm dependencies.
  - Remove the default `priority: 1` from the `defaultJobOptions` configuration.
- 0.0.8
  - Add new routes for PAE jiffy (creates const.inp from AlphaFold PAE JSON input file).
  - Dockerfile build was moved from bullseye to continuumio/miniconda3 to enable conda envs inside Docker container.
  - Add Michal's PAE script `write_const_from_pae.py` directly to this project.
  - Update all NPM dependencies as of 08/06/2023
- 0.0.7
  - baseline.
  - will start using [Semantic Versioning](https://semver.org/).
- 0.0.3
  - BullMQ queue system added.
- 0.0.2
  - Authentication and RBAC added.
- 0.0.1
  - Initial Release.

## Acknowledgments

Inspiration, code snippets, etc.

- [Dave Gray's MERN Stack Tutorial](https://youtube.com/playlist?list=PL0Zuz27SZ-6P4dQUsoDatjEGpmBpcOW8V)
- [Dave Gray's React Tutorial](https://youtube.com/playlist?list=PL0Zuz27SZ-6PrE9srvEn8nbhOOyxnWXfp)
- [bull-board](https://github.com/felixmosh/bull-board)

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[MongoDB]: https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white
[MongoDB-url]: https://www.mongodb.com/
[NodeJS]: https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white
[NodeJS-url]: https://nodejs.org/
[ExpressJS]: https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB
[ExpressJS-url]: https://expressjs.com/
[Redis]: https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white
[Redis-url]: https://redis.io/
[Docker]: https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
[BullMQ]: ./public/BullMQ-logo-sm.png
[BullMQ-url]: https://docs.bullmq.io/
