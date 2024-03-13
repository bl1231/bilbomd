# Helm notes

tag and push `bilbomd-backend`, `bilbomd-ui`

From Apple M3 (`arm64`) need to build for `amd64` in order to run on SPIN

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker build -t bl1231/bilbomd-ui .
docker tag bl1231/bilbomd-ui:latest registry.nersc.gov/m4521/sclassen/bilbomd-ui:latest
docker push registry.nersc.gov/m4521/sclassen/bilbomd-ui:latest
```

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker build -t bl1231/bilbomd-backend: .
docker tag bl1231/bilbomd-backend:latest registry.nersc.gov/m4521/sclassen/bilbomd-backend:latest
docker push registry.nersc.gov/m4521/sclassen/bilbomd-backend:latest
```

The pushing from home can take along time....Let's try building on perlmutter.

not having much luck. `npm install` is running out op file handles.

## Install BilboMD via Helm chart

```bash
helm install bilbomd-nersc-v1 ./bilbomd
```
