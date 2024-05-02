# Helm notes

Some notes on Kubernetes and Helm during my efforts to get BilboMD deployed to NERSC SPIN system (aka Rancher2)

## Build docker images on Apple M3

tag and push `bilbomd-backend`, `bilbomd-ui`

From Apple M3 (`arm64`) need to build for `amd64` in order to run on SPIN

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker build -t bl1231/bilbomd-ui .
docker tag bl1231/bilbomd-ui:latest registry.nersc.gov/m4659/sclassen/bilbomd-ui:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-ui:latest
```

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker build -t bl1231/bilbomd-backend: .
docker tag bl1231/bilbomd-backend:latest registry.nersc.gov/m4659/sclassen/bilbomd-backend:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-backend:latest
```

## Build docker images on Perlmutter login nodes

The pushing from home can take along time....Let's try building on perlmutter.

not having much luck. `npm install` is running out op file handles.

Can try this in orer to get podman-hpc into a happy state again

```bash
podman unshare
rm -rf /images/62704_hpc
rm -rf $SCRATCH/storage
rm -rf ~/.local/share/containers
rm -rf ~/.config/containers
rm -rf /run/user/62704/overlay*
podman-hpc system reset
podman-hpc system migrate
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

This installs everyhting except teh secrets

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
