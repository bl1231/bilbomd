# bilbomd

This repository is a sort fo "wrapper" project. The main purpose is to hold the main `docker-compose.yml` file. It will also serve as a place to document how to deploy BilboMD.

## Description

BilboMD is a webapp developed at the SIBYLS beamline. It uses Molecular Dynamics from [CHARMM](https://academiccharmm.org/) to generate a vast array of possible molecular structures. This ensemble of possible models is then used to calculate theoretical SAXS curves using [FoXS](https://modbase.compbio.ucsf.edu/foxs/about), compared with empirical SAXS data using [MultiFoXS](https://modbase.compbio.ucsf.edu/multifoxs/about) to find an ensemble of models that best explains your SAXS data.

## High level architecture

![BilboMD Design](docs/bilbomd-architecture.drawio.png)

## Technology Stack

One of the major goals of the redesign of BilboMD was to modernize the various technologies used by the webapp. I'll just summarize them here:

### backend

-   [![NodeJS][NodeJS]][NodeJS-url]
-   [![MongoDB][MongoDB]][MongoDB-url]
-   [![ExpressJS][ExpressJS]][ExpressJS-url]
-   [![Docker][Docker]][Docker-url]
-   [![Redis][Redis]][Redis-url]
-   [BullMQ][BullMQ-url]

### frontend

-   [Create React App][CRA-url]
-   [React][React-url]
-   [Redux][Redux-url]
-   [Material UI][MUI-url]
-   [Yup][YUP-url]
-   [Formik][Formik-url]

# Deployment

Deploying BilboMD web app currently requires a couple of steps. These instructions are assuming you will deploy on `hyperion`, but the code shoudl be very portable.

## The `.env` file

The `.env` file can be created from the `.env_example` file and contains all the secrets needed to deploy BilboMD. To create the access `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` cryptographic keys just launch an interactive `node` terminal and type the following command:

```bash
require('crypto').randomBytes(64).toString('hex')
```

There are a number of other environment variables specified in the `.env` file that are needed by the various docker services/containers outlined below. They should be fairly self explanitory.

## 1. Build and deploy the backend Docker services.

You must have the ability to start docker containers on the machine where you want to run BilboMD backend services. The `docker-compose.yml` file specifies 4 services:

-   bilbomd-backend
-   bilbomd-worker
-   bilbomd-mongodb
-   bilbomd-redis

### [bilbomd-backend][bilbomd-backend]

This is the main NodeJS backend that I wrote to handle the non-computational-related app functions. It performs authentication, authorization, retrieves job info from the main MongoDB database, user management, cookies, etc. This docker container requires port `3500` to be exposed. See the `Dockerfile` in the `bilbomd-backend` [repo][bilbomd-backend] for details.

### [bilbomd-worker][bilbomd-worker]

This is the docker container where the actual BilboMD computations are performed. It is built on a `debian:bullseye base` image. It also has CHARMM (version is specified in the `.env` file) and IMP baked in. See the `Dockerfile` in the `bilbomd-worker` [repo][bilbomd-worker] for details.

### bilbomd-redis

This service uses the default [Redis Docker image](https://hub.docker.com/_/redis). `bilbomd-redis` is a straight forward Redis docker container. No Docker file is required to build it. Redis (Remote Dictionary Server) is required by the BullMQ queueing system to store queue item information. We expose port `6379` so that other docker containers in the docker app-network can communicate with it.

### bilbomd-mongodb

This service uses the default [MongoDB Docker image](https://hub.docker.com/_/mongo). `bilbomd-mongodb` hosts the main database for BilboMD. It's quite simple at the moment with only 2 "tables" ; one for users and one for jobs. The details for these can be found in `bilbomd-backend/model/Job.js` and `bilbomd-backend/model/User.js`. This docker container requires port `27017` to be exposed.

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

Check that they are running and "healthy" with the `docker ps` command:

```
(base) [15:50]classen@hyperion:~/projects/bilbomd$docker ps
CONTAINER ID   IMAGE                    COMMAND                  CREATED        STATUS                  PORTS                                           NAMES
a375b532034c   bl1231/bilbomd-worker    "docker-entrypoint.s…"   26 hours ago   Up 26 hours                                                             bilbomd-worker
bc8089076e87   bl1231/bilbomd-backend   "docker-entrypoint.s…"   26 hours ago   Up 26 hours             0.0.0.0:3500->3500/tcp, :::3500->3500/tcp       bilbomd-backend
201af62299f2   mongo                    "docker-entrypoint.s…"   26 hours ago   Up 26 hours (healthy)   0.0.0.0:27018->27017/tcp, :::27018->27017/tcp   bilbomd-mongodb
b39a1c3902d0   redis                    "docker-entrypoint.s…"   28 hours ago   Up 26 hours             0.0.0.0:6379->6379/tcp, :::6379->6379/tcp       bilbomd-redis
```

We are now ready to get the user-facing UI up and running.

## 2. Deploy the BilboMD front end UI

_note:_ There are different instructions for running `bilbomd-ui` in development mode which I will write up later. This information and these instructions are geared towards the "production" instance of `bilbomd-ui`.

### Background

**BilboMD** will be served from [https://bilbomd.bl1231.als.lbl.gov](https://bilbomd.bl1231.als.lbl.gov). This domain points to Cloudflare which then points back to the beamline gateway machine at `bl1231-local.als.lbl.gov` which then [NAT](https://en.wikipedia.org/wiki/Network_address_translation)s all 80/443 traffic to our main webserver which is running Apache httpd. Our Apache server `www.bl1231.als.lbl.gov` is configured to provide name-based virtual hosting. Essentially a single httpd process that can serve multiple websites (e.g. our main Wordpress site at `bl1231.als.lbl.gov`, out GitLab server at `git.bl1231.als.lbl.gov`, and now bilbomd at `bilbomd.bl1231.als.lbl.gov`).

Although the main Apache server is running on a dedicated machine `www.bl1231.als.lbl.gov` we make extensive use of `ProxyPass` and `ProxyPassReverse` to connect to backend servers of various types.

### Apache VirtualHost configuration

I'm not going to go into extensive description of the Apaceh setup at 12.3.1, but here is a snippet from teh config files that pertains to **BilboMD**.

```
<VirtualHost *:443>
    ServerName bilbomd.bl1231.als.lbl.gov
    ServerAdmin  sclassen@lbl.gov

    # LOGGING
    ErrorLog logs/bilbomd-error.log
    TransferLog logs/bilbomd-access.log

    # PROXY TO BACKEND SERVER
    ProxyPass "/" "http://hyperion.bl1231.als.lbl.gov:3001/"
    ProxyPassReverse "/" "http://hyperion.bl1231.als.lbl.gov:3001/"

    # SSL SETTINGS
    # self signed certs which should be fine for use with Cloudflare
    # look in the git@git.bl1231.als.lbl.gov:sa/sibyls-ansible-stuff.git
    # for the CSRs etc. in roles/openldap25/files/certs
    SSLEngine on
    SSLCertificateFile /etc/httpd/certs/bilbomd.crt
    SSLCertificateKeyFile /etc/httpd/certs/bilbomd.key
    SSLCertificateChainFile /etc/httpd/certs/BL-1231-CA.crt
</VirtualHost>
```

So from this you can probably figure out that any requests to `bilbomd.bl1231.als.lbl.gov` will be forwarded to port `3001` on `hyperion.bl1231.als.lbl.gov`. In general we don't want to run webapps as the root user or as our personal linux accounts, so I've set up a special service account (`webadmin`) that we can run webapps under.

### Checkout the `bilbomd-ui` code.

Check out the frontend UI repo from GitHub:

```bash
git clone git@github.com:bl1231/bilbomd-ui.git
```

### Get a few onetime things prepared

We will use [PM2](https://pm2.keymetrics.io/) to deploy `bilbomd-ui`, but first there are a few onetime things that need to be in place.

Create a directory on `hyperion` (or on whatever machine you are going to run **BilboMD** ) for the deployed app to live:

```bash
mkdir /bilbomd
chown to webadmin
```

The `webadmin` user will require Node Version Manager and NodeJS.

### Install [nvm](https://github.com/nvm-sh/nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
```

Logout and back in. [NVM Documentation](https://github.com/nvm-sh/nvm#table-of-contents)

### Then use `nvm` to install NodeJS

```bash
nvm install --lts
nvm use --lts
```

You might need to logout and back in. You can also create a [`.nvmrc`](https://github.com/nvm-sh/nvm#nvmrc) file to define the version of NodeJS that you want to use in a particular directory.

### Install PM2

```
npm install pm2@latest -g
npm install pm2@latest
```

You might need to logout and back in.

### PM2 Stuff

Then as `classen` (or yourself) you can deploy with **PM2**. First make sure you are in the `bilbomd-ui` directory that you checked out from GitHub. **PM2** uses the `bilbomd-ui/ecosystem.config.js` configuration file.

```bash
cd bilbomd-ui
```

### The first time only you run the `setup` command

```bash
pm2 deploy production setup
```

### To update production from GitHub

```bash
git pull
pm2 deploy production update
```

### To revert to previous version using pm2

```bash
pm2 deploy production revert
```

### To run a specific pm2 command on the production server

```bash
pm2 deploy production exec "pm2 start BilboMD"
```

### To see status

```bash
pm2 deploy production exec "pm2 show BilboMD"
pm2 deploy production exec "pm2 ls"
```

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
[BullMQ-url]: https://docs.bullmq.io/
[React-url]: https://react.dev/
[CRA-url]: https://create-react-app.dev/
[Redux-url]: https://redux.js.org/
[MUI-url]: https://mui.com/
[Formik-url]: https://formik.org/
[YUP-url]: https://github.com/jquense/yup
[bilbomd-worker]: https://github.com/bl1231/bilbomd-worker
[bilbomd-backend]: https://github.com/bl1231/bilbomd-backend
