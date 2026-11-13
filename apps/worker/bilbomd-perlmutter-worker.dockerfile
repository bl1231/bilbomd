# -----------------------------------------------------------------------------
# Build stage 1 - Install build tools & dependencies
FROM nvidia/cuda:12.9.2-devel-ubuntu22.04 AS builder
RUN apt-get update && \
    apt-get install -y cmake gcc gfortran g++ python3 \
    libpmix-bin libpmix-dev parallel wget bzip2 ncat \
    gfortran libgl1-mesa-dev libarchive13 zip build-essential && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Build stage 2 - conda
FROM builder AS build-conda

# Download and install Miniforge3
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh

# Install into a dedicated env pinned to Python 3.12, the default `python` in the
# beamline worker image, not into Miniforge's base env: base carries conda/mamba
# from whatever "latest" installer we downloaded, and their pins can break the solve.
RUN /miniforge3/bin/conda create -y -n bilbomd -c conda-forge \
    python=3.12 \
    numpy==2.3.3 \
    scipy==1.16.2 \
    cython==3.1.4 \
    swig==4.3.1 \
    doxygen==1.13.2 \
    matplotlib \
    python-igraph==0.11.9 \
    pyyaml \
    pandas \
    biopython \
    && /miniforge3/bin/conda clean -afy

# Add the env (then conda itself) to PATH
ENV PATH="/miniforge3/envs/bilbomd/bin:/miniforge3/bin:${PATH}"

# -----------------------------------------------------------------------------
# Build stage 3 - CHARMM
FROM build-conda AS build-charmm
ARG CHARMM_VER=c51b1

# Build from the repo root with the CHARMM source tarball in apps/worker/charmm/
# (see its README). Only CHARMM's binary, library and toppar reach the final
# stage, and this image stays in NERSC's podman-hpc store: never push it.
COPY apps/worker/charmm/${CHARMM_VER}.tar.gz /usr/local/src/
RUN mkdir -p /usr/local/src && \
    tar --no-same-owner -xzf /usr/local/src/${CHARMM_VER}.tar.gz -C /usr/local/src && \
    rm /usr/local/src/${CHARMM_VER}.tar.gz

WORKDIR /usr/local/src/charmm
RUN ./configure --with-gnu

# Parallel compile jobs; empty means all cores.
ARG CHARMM_MAKE_JOBS=
RUN make -j"${CHARMM_MAKE_JOBS:-$(nproc)}" -C build/cmake install
# Up to c49b2, bin/charmm is one static program; from c51 it is a small
# launcher that loads lib/libchmm.so through a RUNPATH into this source tree,
# so lib/ has to come along (same as bilbomd-worker-charmm.dockerfile).
RUN mkdir -p /opt/charmm/bin /opt/charmm/lib && \
    cp bin/charmm /opt/charmm/bin/ && \
    if [ -d lib ]; then cp -a lib/. /opt/charmm/lib/; fi

# -----------------------------------------------------------------------------
# Build stage 4 - worker app (intermediate)
FROM build-charmm AS bilbomd-perlmutter-worker-intermediate
ARG USER_ID
WORKDIR /app
# App-specific worker scripts
COPY apps/worker/scripts/ /app/scripts/
# Shared helper scripts moved to monorepo tools/python
COPY tools/python/ /app/scripts/
RUN chown -R $USER_ID:0 /app

# -----------------------------------------------------------------------------
# Build stage 5 - Final runtime image
FROM nvidia/cuda:12.9.2-runtime-ubuntu22.04 AS bilbomd-perlmutter-worker

RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common parallel && \
    add-apt-repository ppa:salilab/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends imp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy conda from build-conda stage
COPY --from=bilbomd-perlmutter-worker-intermediate /miniforge3 /miniforge3

# Copy the app from the intermediate stage
COPY --from=bilbomd-perlmutter-worker-intermediate /app /app

# CHARMM: the binary, its shared library (c51+) and the force field files
COPY --from=build-charmm /opt/charmm/bin/charmm /usr/local/bin/charmm
COPY --from=build-charmm /opt/charmm/lib/ /usr/local/lib/charmm/
COPY --from=build-charmm /usr/local/src/charmm/toppar /app/charmm-toppar
# The launcher's RUNPATH points at the builder's source tree, which doesn't
# exist here, so register the library with the loader cache. CHARMM prints its
# banner before it reads any input; if it can't start, show what is missing.
RUN echo /usr/local/lib/charmm > /etc/ld.so.conf.d/charmm.conf && ldconfig && \
    if ! echo stop | charmm 2>&1 | grep -q "Chemistry at HARvard Macromolecular Mechanics"; then \
      ldd /usr/local/bin/charmm; exit 1; \
    fi

# Set environment variables
ENV PATH="/miniforge3/envs/bilbomd/bin:/miniforge3/bin:${PATH}"
ENV LD_LIBRARY_PATH="/usr/local/lib:${LD_LIBRARY_PATH}"

WORKDIR /app

# ---- Smoke test script installation ----
COPY apps/worker/scripts/smoke_test.sh /usr/local/bin/smoke_test.sh
RUN chmod +x /usr/local/bin/smoke_test.sh
