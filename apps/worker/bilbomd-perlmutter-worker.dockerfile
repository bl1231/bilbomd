# -----------------------------------------------------------------------------
# Build stage 1 - Install build tools & dependencies
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS builder
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

# Add Conda to PATH
ENV PATH="/miniforge3/bin/:${PATH}"

# Update conda
RUN conda update -y -n base -c defaults conda && \
    conda install -y -c conda-forge \
    numpy==2.3.3 \
    scipy==1.16.2 \
    cython==3.1.4 \
    swig==4.3.1 \
    doxygen==1.13.2 \
    matplotlib==3.9.1 \
    python-igraph==0.11.9 \
    pyyaml \
    pandas \
    && conda clean -afy

# -----------------------------------------------------------------------------
# Build stage 3 - CHARMM
FROM build-conda AS build-charmm
ARG CHARMM_VER=c49b2

# COPY ./charmm/${CHARMM_VER}.tar.gz /usr/local/src/
RUN wget https://bl1231.als.lbl.gov/pickup/charmm/${CHARMM_VER}.tar.gz -O /usr/local/src/${CHARMM_VER}.tar.gz
RUN mkdir -p /usr/local/src && \
    tar -zxvf /usr/local/src/${CHARMM_VER}.tar.gz -C /usr/local/src && \
    rm /usr/local/src/${CHARMM_VER}.tar.gz

WORKDIR /usr/local/src/charmm
RUN ./configure --with-gnu

RUN make -j$(nproc) -C build/cmake install
RUN cp /usr/local/src/charmm/bin/charmm /usr/local/bin/

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
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS bilbomd-perlmutter-worker

RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common parallel && \
    add-apt-repository ppa:salilab/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends imp=2.23.0-1~jammy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy conda from build-conda stage
COPY --from=bilbomd-perlmutter-worker-intermediate /miniforge3 /miniforge3

# Copy the app from the intermediate stage
COPY --from=bilbomd-perlmutter-worker-intermediate /app /app

# Copy only the CHARMM binary and its required libs
COPY --from=bilbomd-perlmutter-worker-intermediate /usr/local/bin/charmm /usr/local/bin/charmm

# Set environment variables
ENV PATH="/miniforge3/bin:${PATH}"
ENV LD_LIBRARY_PATH="/usr/local/lib:${LD_LIBRARY_PATH}"

WORKDIR /app

# ---- Smoke test script installation ----
COPY apps/worker/scripts/smoke_test.sh /usr/local/bin/smoke_test.sh
RUN chmod +x /usr/local/bin/smoke_test.sh
