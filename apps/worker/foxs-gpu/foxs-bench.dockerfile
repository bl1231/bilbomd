# FoXS benchmark image (issue #1157).
#
# Builds the standalone dina-lab3D FoXS (CPU and CUDA variants) and layers the
# binaries onto the BilboMD worker image, which already ships IMP's FoXS and
# multi_foxs. Lets us compare all three side by side on identical inputs.
#
#   docker build -f foxs-bench.dockerfile -t bilbomd-foxs-bench:local .
#
# Not used by any deployment.

ARG WORKER_IMAGE=ghcr.io/bl1231/bilbomd-worker:2.21.3

FROM nvidia/cuda:12.9.2-devel-ubuntu22.04 AS build
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential ca-certificates git libboost-program-options-dev python3 && \
    rm -rf /var/lib/apt/lists/*

ARG FOXS_REPO=https://github.com/dina-lab3D/foxs.git
# Pin the commit under test. Bump deliberately.
ARG FOXS_REF=a2e4270d6b44f2fef736bbff99a4effab861e584
# A100 (epyc, Perlmutter) is sm_80.
ARG CUDA_ARCH=sm_80

RUN git clone "${FOXS_REPO}" /src/foxs && git -C /src/foxs checkout "${FOXS_REF}"
WORKDIR /src/foxs
RUN make -j"$(nproc)" TARGET=foxs-cpu && \
    make -j"$(nproc)" GPU=1 CUDA_ARCH="${CUDA_ARCH}" TARGET=foxs-gpu && \
    python3 tests/test_foxs.py ./foxs-cpu && \
    git rev-parse HEAD > /src/foxs/FOXS_REF

FROM ${WORKER_IMAGE}
COPY --from=build /src/foxs/foxs-cpu /src/foxs/foxs-gpu /usr/local/bin/
COPY --from=build /src/foxs/FOXS_REF /opt/foxs-bench/FOXS_REF
COPY --from=build /src/foxs/tests /opt/foxs-bench/upstream-tests
COPY bench.py scaling.py /opt/foxs-bench/
RUN foxs-cpu --version && foxs-gpu --version && foxs --version
ENTRYPOINT []
CMD ["python3", "/opt/foxs-bench/bench.py", "--help"]
