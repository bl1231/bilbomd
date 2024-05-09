# Helm notes

Some notes on Kubernetes and Helm during my efforts to get BilboMD deployed to NERSC SPIN system (aka Rancher2)

## Background and Setup Instructions for Building Docker Images

Because I've separated some of the original functionality of `bilbomd-worker` so there is one build for SPIN and another build for Perlmutter I have decided to give explicit names for images destined for SPIN and Perlmutter. You will need to build, tag, and push `bilbomd-spin-backend`, `bilbomd-spin-worker`, `bilbomd-perlmutter-worker`, and `bilbomd-ui`

If building on Apple with M3 Silicon (`arm64`) you will need to build for `amd64` in order to run on SPIN. There are ways to build images for multiple hardware platforms, but I have not explored this option yet.

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
```

In order to push to NERSC's Docker service, login to `https://registry.nersc.gov/`

```bash
docker login registry.nersc.gov
```

## Build Instructions

I have made `docker` an alias for `podman-hpc` on perlmutter.

### `bilbomd-ui`

```bash
cd bilbomd-ui
docker build -t bilbomd/bilbomd-ui .
docker tag bilbomd/bilbomd-ui:latest registry.nersc.gov/m4659/sclassen/bilbomd-ui:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-ui:latest
```

### `bilbomd-spin-backend`

```bash
cd bilbomd-spin-backend
docker build --build-arg USER_ID=$UID -t bilbomd/bilbomd-spin-backend -f bilbomd-spin-backend.dockerfile .
docker tag bilbomd/bilbomd-spin-backend:latest registry.nersc.gov/m4659/sclassen/bilbomd-spin-backend:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-spin-backend:latest
```

### `bilbomd-spin-worker`

```bash
cd bilbomd-worker
docker build -t bilbomd/bilbomd-spin-worker -f bilbomd-spin-worker.dockerfile .
docker tag bilbomd/bilbomd-spin-worker:latest registry.nersc.gov/m4659/sclassen/bilbomd-spin-worker:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-spin-worker:latest
```

### `bilbomd-perlmutter-worker`

```bash
cd bilbomd-worker
docker build --build-arg USER_ID=$UID -t bilbomd/bilbomd-perlmutter-worker -f bilbomd-perlmutter-worker.dockerfile .
docker tag bilbomd/bilbomd-perlmutter-worker:latest registry.nersc.gov/m4659/sclassen/bilbomd-perlmutter-worker:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-perlmutter-worker:latest
```

## Troubleshooting Build docker images on Perlmutter login nodes

Can try this in order to get podman-hpc into a happy state again

```bash
podman unshare
rm -rf /images/62704_hpc
rm -rf $SCRATCH/storage
rm -rf ~/.local/share/containers
rm -rf ~/.config/containers
rm -rf /run/user/62704/overlay*
podman-hpc system reset
podman-hpc system migrate
exit
```

## KubeConfig

download the `development.yaml` config from Rancher.
put it in ~/.kube/
set $KUBECONFIG environment variable

set default namespace

kubectl config set-context --current --namespace=bilbomd

## Install BilboMD via Helm chart

```bash
helm install bilbomd-nersc-v1 ./bilbomd
```

This installs everyhting except the secrets

install secrets:

```bash
k apply -f helm-secrets/backend-secrets.yaml
k apply -f helm-secrets/mongo-secrets.yaml
k apply -f helm-secrets/ui-tls-secrets.yaml
```

## Upgrade BilboMD via Helm chart

```bash
helm upgrade bilbomd-nersc-v1 ./bilbomd
```

## Uninstall BilboMD via Helm chart

```bash
helm uninstall bilbomd-nersc-v1
```

## Exposing an ingress so that we can access the MongoDB database

For this we need to create a load balancer. NERSC has some [documentation](https://docs.nersc.gov/services/spin/connecting/#non-http-services-load-balancers) that explains how this is done.

I think the load balancer takes the place of the Cluster IP service?
