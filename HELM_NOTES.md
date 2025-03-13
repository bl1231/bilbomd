# Helm notes

Some notes on Kubernetes and Helm during my efforts to get BilboMD deployed to NERSC SPIN system (aka Rancher2)

## Background and Setup Instructions for Building Docker Images

I have separated some of the original functionality of `bilbomd-worker` so there is one build for SPIN and another build for Perlmutter I have decided to give explicit names for images destined for SPIN and Perlmutter. You will need to build, tag, and push `bilbomd-spin-backend`, `bilbomd-spin-worker`, `bilbomd-perlmutter-worker`, and `bilbomd-ui`

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

I have created a separte package ([@bl1231/bilbomd-mongodb-schemas](https://github.com/bl1231/bilbomd-mongodb-schema/pkgs/npm/bilbomd-mongodb-schema)) to hold the MongoDB schema and Typeface interfaces for bilbomd apps. It is published to [GitHub packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) and as of the writing of these notes requires a token in order to install it... even though it is public (? seems odd.). Anyways ya gotta set your token before building.

```bash
export GITHUB_TOKEN=<your-token-here>
```

### `bilbomd-ui`

```bash
cd bilbomd-ui
docker build -t bilbomd/bilbomd-ui .
docker tag bilbomd/bilbomd-ui:latest registry.nersc.gov/m4659/sclassen/bilbomd-ui:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-ui:latest
```

### `bilbomd-spin-backend`

```bash
cd bilbomd-backend
docker build --build-arg GITHUB_TOKEN=$GITHUB_TOKEN --build-arg USER_ID=$UID -t bilbomd/bilbomd-spin-backend -f bilbomd-spin-backend.dockerfile .
docker tag bilbomd/bilbomd-spin-backend:latest registry.nersc.gov/m4659/sclassen/bilbomd-spin-backend:latest
docker push registry.nersc.gov/m4659/sclassen/bilbomd-spin-backend:latest
```

### `bilbomd-spin-worker`

```bash
cd bilbomd-worker
docker build --build-arg GITHUB_TOKEN=$GITHUB_TOKEN -t bilbomd/bilbomd-spin-worker -f bilbomd-spin-worker.dockerfile .
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

## Kubernetes Stuff

Before you can use the `kubectl` or `helm` commands you need to download the `development.yaml` config for both the development and production servers from Rancher. Then combine them into a single config file like this:

`kubeconfig.yaml`

```yaml
apiVersion: v1
clusters:
  - cluster:
      server: https://rancher2.spin.nersc.gov/k8s/clusters/XXXXXXX
    name: development
  - cluster:
      server: https://rancher2.spin.nersc.gov/k8s/clusters/XXXXXXX
    name: production
contexts:
  - context:
      cluster: development
      namespace: bilbomd
      user: development
    name: development
  - context:
      cluster: production
      namespace: bilbomd
      user: production
    name: production
current-context: production
kind: Config
preferences: {}
users:
  - name: development
    user:
      token: kubeconfig-u-XXXXXXX
  - name: production
    user:
      token: kubeconfig-u-XXXXXXX
```

Put it in your `~/.kube/` directory and configure your shell `KUBECONFIG` environment variable to point to the `kubeconfig.yaml` file.

## Install BilboMD via Helm chart

If nothing is installed or running on SPIN you need to "install" the app first. The secrets should be installed first followed by the rest of teh kubernetes manifest files.

### Install secrets

Installing teh secrets should be done before running the `helm install` commands since the installation process will require pulling docker images from `registry.nersc.gov` or `ghcr.io` which requires access to the necessary secrets. The `helm-secrets` directory is **not** checked into GitHub.

The secrets needed include:

- `backend-secrets` - Contains various ENV setting needed by backend apps.
- `mongo-secrets` - Contains the root password for the MongoDB database.
- `ui-tls` - SSL/TLS certificate for the web frontend ui.
- `ghcr` - A GitHub Personal Access Token needed to pull docker images from `ghcr.io`.
- `registry-nersc` - This secret is provided automatically by SPIN, and is required to pull images from `registry.nersc.gov`.
- `sfapi-priv-key` - This contains the private key from our 30-day Superfacility API red client.

If you have local copies of the secrets as yaml files they can be "applied" to the `bilbomd` namespace thusly:

```bash
kubectl apply -f helm-secrets/backend-secrets.yaml
kubectl apply -f helm-secrets/mongo-secrets.yaml
kubectl apply -f helm-secrets/ui-tls-secrets.yaml
```

### Development

```bash
helm install bilbomd-nersc-dev ./helm -f ./helm/values-dev.yaml
```

### Production

```bash
helm install bilbomd-nersc-prod ./helm -f ./helm/values-prod.yaml
```

## Upgrade BilboMD via Helm chart

I have combined the kube config yaml files from both the development and production servers into a single yaml file. In order to switch kubectl commands between the development and production servers you must first select the "context" to use.

```bash
kubectl config use-context bilbomd-prod
```

or

```bash
kubectl config use-context bilbomd-dev
```

And check that the desired context is the active one:

```sh
❯ kubectl config get-contexts
CURRENT   NAME           CLUSTER       AUTHINFO      NAMESPACE
          bilbomd-dev    development   development   bilbomd
*         bilbomd-prod   production    production    bilbomd
```

### Development

```bash
helm upgrade bilbomd-nersc-dev ./helm -f ./helm/values-dev.yaml
```

### Production

```bash
helm upgrade bilbomd-nersc-prod ./helm -f ./helm/values-prod.yaml
```

## Uninstall BilboMD via Helm chart

```bash
helm uninstall bilbomd-nersc-dev
```

or

```bash
helm uninstall bilbomd-nersc-dev
```

## Exposing an ingress so that we can access the MongoDB database

For this we need to create a load balancer. NERSC has some [documentation](https://docs.nersc.gov/services/spin/connecting/#non-http-services-load-balancers) that explains how this is done.

I think the load balancer takes the place of the Cluster IP service?
