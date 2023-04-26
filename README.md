# bilbomd

This repository is a sort fo "wrapper" project. The main purpose for now is to hold the main `docker-compose.yml` file.

## Description

BilboMD is a webapp developed at the SIBYLS beamline. It uses Molecular Dynamics from CHARMM to generate a vast array of possible molecualr structures. This ensemble of possibel models is then compared with emperical SAXS data to find an ensemble of models that best explains your SAXS data.

## High level architecture

![BilboMD Design](docs/bilbomd-architecture.drawio.png)

## Technology Stack

here

## Deployment

Deploying BilboMD web app currently requires a couple of steps.

## 1. Build and deploy the backend Docker services.

You must have the ability to start docker containers on the machine where you want to run BilboMD backend services. The `docker-compose.yml` file specifies 4 services:

-   bilbomd-redis
-   bilbomd-backend
-   bilbomd-mongodb
-   bilbomd-worker

### bilbomd-redis

This is a straight forward Redis docker container. No Docker file required to build. Redis (Remote Dictionary Server) is required by the BullMQ queueing system to store queue item information. We are exposing port `6379` so that other docker containers in the docker app-network can communicate with it.

### bilbomd-backend

This is the main NodeJS backend that I wrote to handle the non-computational-related app functions. It performs authentication, authorization, retrieves job info from the main MongoDB database, user management, cookies, etc. This docker container requires port `3500` to be exposed. See the `Dockerfile` in the `bilbomd-backend` repo for details.

### bilbomd-mongodb

This is the main database for the bilbomd app. It's quite simple at the moment with only 2 "tables" ; one for users and one for jobs. The details for these can be found in `bilbomd-backend/model/Job.js` and `bilbomd-backend/model/User.js`. This docker container requires port `27017` to be exposed.

### bilbomd-worker

This is the docker container where the actual BilboMD computations are performed. It is built on a `debian:bullseye base` image. It also has CHARMM (version is specified in the `.env` file) and IMP baked in. See the `Dockerfile` in the `bilbomd-worker` repo for details.

This should be checked, but my recollection is that this should be sufficient to build and deploy the Docker stuff:

checkout the top level bilbomd repo:

```bash
cd directory/where/you/want/to/work
git clone git@github.com:bl1231/bilbomd.git
cd bilbomd
```

check out the other repos:

```bash
git clone git@github.com:bl1231/bilbomd-backend.git
git clone git@github.com:bl1231/bilbomd-worker.git
```

Build and deploy the Docker services. You should be in the top level `bilbomd` directory where the `docker-compose.yml` file resides:

```bash
docker compose build
docker compose up
```

or to start in a detached mode:

```bash
docker compose up --detach
```

Check that they are running and "healthy"

```
(base) [15:50]classen@hyperion:~/projects/bilbomd$docker ps
CONTAINER ID   IMAGE                    COMMAND                  CREATED        STATUS                  PORTS                                           NAMES
a375b532034c   bl1231/bilbomd-worker    "docker-entrypoint.s…"   26 hours ago   Up 26 hours                                                             bilbomd-worker
bc8089076e87   bl1231/bilbomd-backend   "docker-entrypoint.s…"   26 hours ago   Up 26 hours             0.0.0.0:3500->3500/tcp, :::3500->3500/tcp       bilbomd-backend
201af62299f2   mongo                    "docker-entrypoint.s…"   26 hours ago   Up 26 hours (healthy)   0.0.0.0:27018->27017/tcp, :::27018->27017/tcp   bilbomd-mongodb
b39a1c3902d0   redis                    "docker-entrypoint.s…"   28 hours ago   Up 26 hours             0.0.0.0:6379->6379/tcp, :::6379->6379/tcp       bilbomd-redis
```

## 2. Deploy the BilboMD front end UI

and if you want to develop or deploy the frontend UI get that repo too:

```bash
git clone git@github.com:bl1231/bilbomd-ui.git
```
