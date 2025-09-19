# -----------------------------------------------------------------------------
# Build stage 1 - Install build tools & dependencies
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS builder
RUN apt-get update && \
    apt-get install -y cmake gcc gfortran g++ python3 \
    libpmix-bin libpmix-dev parallel wget bzip2 ncat \
    gfortran libgl1-mesa-dev libarchive13 zip build-essential && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Build stage 2 - Miniconda3
FROM builder AS build-conda

# Download and install Miniforge3
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh

# Add Conda to PATH
ENV PATH="/miniforge3/bin/:${PATH}"

# Update conda
RUN conda update -y -n base -c defaults conda && \
    conda install -y cython swig doxygen && \
    conda clean -afy

# Copy environment.yml and install dependencies
COPY environment.yml /tmp/environment.yml
RUN conda env update -f /tmp/environment.yml && \
    rm /tmp/environment.yml && \
    conda clean -afy

# -----------------------------------------------------------------------------
# Build stage 4 - CHARMM
FROM build-conda AS build-charmm
ARG CHARMM_VER=c48b2

# Probably not needed for OpenMM, but installed anyways for testing purposes.
# RUN apt-get update && \ 
#     apt-get install -y fftw3 fftw3-dev && \
#     rm -rf /var/lib/apt/lists/*

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
# Build stage 5 - IMP
FROM build-charmm AS bilbomd-worker-step2
RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common && \
    add-apt-repository ppa:salilab/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends imp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Build stage 7 - worker app (intermediate)
FROM bilbomd-worker-step2 AS bilbomd-perlmutter-worker-intermediate
ARG USER_ID
WORKDIR /app
COPY scripts/ scripts/
RUN chown -R $USER_ID:0 /app

# Build stage 8 - Final runtime image
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS bilbomd-perlmutter-worker

RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common && \
    add-apt-repository ppa:salilab/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends imp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=bilbomd-worker-step2 /miniforge3 /miniforge3
COPY --from=bilbomd-perlmutter-worker-intermediate /app /app

# Copy only the CHARMM binary and its required libs
COPY --from=bilbomd-worker-step2 /usr/local/bin/charmm /usr/local/bin/charmm
COPY --from=bilbomd-worker-step2 /usr/local/src/charmm/lib /usr/local/src/charmm/lib

# Set environment variables
ENV PATH="/miniforge3/bin:${PATH}"
ENV LD_LIBRARY_PATH="/usr/local/lib:/usr/local/src/charmm/lib:${LD_LIBRARY_PATH}"

WORKDIR /app