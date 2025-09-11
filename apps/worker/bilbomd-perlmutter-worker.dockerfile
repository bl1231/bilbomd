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
# Build stage 3 - OpenMM
FROM build-conda AS build-openmm
ARG OPENMM_VER=8.1.2

# COPY ./openmm/${OPENMM_VER}.tar.gz /usr/local/src
# Download the OpenMM source code using wget
RUN wget https://github.com/openmm/openmm/archive/refs/tags/${OPENMM_VER}.tar.gz -O /usr/local/src/${OPENMM_VER}.tar.gz

RUN tar -zxvf /usr/local/src/${OPENMM_VER}.tar.gz -C /usr/local/src && \
    rm /usr/local/src/${OPENMM_VER}.tar.gz
WORKDIR /usr/local/src/openmm-${OPENMM_VER}/build
RUN cmake .. -DCMAKE_INSTALL_PREFIX=/usr/local/openmm

RUN make -j$(nproc) && make install

# Set environment variables needed for CHARMM build
ENV CUDATK=/usr/local/cuda
ENV OPENMM_PLUGIN_DIR=/usr/local/openmm/lib/plugins
ENV LD_LIBRARY_PATH=/usr/local/openmm/lib:$OPENMM_PLUGIN_DIR:$LD_LIBRARY_PATH

# -----------------------------------------------------------------------------
# Build stage 4 - CHARMM
FROM build-openmm AS build-charmm
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
# Build stage 5 - BioXTAS RAW
FROM build-charmm AS bilbomd-worker-step1

# Copy the BioXTAS GitHiub master zip file
WORKDIR /tmp
# COPY bioxtas/bioxtasraw-master.zip .

# Download the BioXTAS RAW master zip file using wget
RUN wget https://github.com/jbhopkins/bioxtasraw/archive/refs/heads/master.zip -O bioxtasraw-master.zip
RUN unzip bioxtasraw-master.zip && rm bioxtasraw-master.zip

# Install BioXTAS RAW into local Python environment
WORKDIR /tmp/bioxtasraw-master
RUN python setup.py build_ext --inplace && \
    pip install . && \
    rm -rf /tmp/bioxtasraw-master

# -----------------------------------------------------------------------------
# Build stage 6 - IMP
FROM bilbomd-worker-step1 AS bilbomd-worker-step2
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

COPY --from=bilbomd-worker-step2 /usr/local/openmm /usr/local/openmm
COPY --from=bilbomd-worker-step2 /usr/local/openmm/lib /usr/local/openmm/lib
COPY --from=bilbomd-worker-step2 /usr/local/openmm/lib/plugins /usr/local/openmm/lib/plugins
COPY --from=bilbomd-worker-step2 /miniforge3 /miniforge3
COPY --from=bilbomd-perlmutter-worker-intermediate /app /app
COPY --from=bilbomd-worker-step2 /usr/bin/ /usr/bin/
COPY --from=bilbomd-worker-step2 /usr/local/bin/ /usr/local/bin/
COPY --from=bilbomd-worker-step2 /usr/lib/ /usr/lib/
COPY --from=bilbomd-worker-step2 /usr/local/lib/ /usr/local/lib/
COPY --from=bilbomd-worker-step2 /usr/local/src/charmm/lib /usr/local/src/charmm/lib
# Set environment variables
ENV PATH="/miniforge3/bin/:${PATH}"
ENV OPENMM_PLUGIN_DIR=/usr/local/openmm/lib/plugins
ENV LD_LIBRARY_PATH=/usr/local/openmm/lib:/usr/local/openmm/lib/plugins:/usr/lib:/usr/local/lib:$LD_LIBRARY_PATH

WORKDIR /app