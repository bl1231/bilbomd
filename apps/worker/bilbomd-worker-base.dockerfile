# -----------------------------------------------------------------------------
# Setup the base image for building
FROM nvidia/cuda:12.9.1-devel-ubuntu22.04 AS install-dependencies

# Pin versions for better caching
ARG CHARMM_VER=c49b2
ARG OPENMM_VERSION=8.5.1
ARG PYTHON_VERSION=3.12

RUN apt-get update && \
    apt-get install -y cmake gcc gfortran g++ wget libgl1-mesa-dev \
    build-essential libarchive13 zip python3-launchpadlib curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Build CHARMM
FROM install-dependencies AS build_charmm
RUN wget https://bl1231.als.lbl.gov/pickup/charmm/${CHARMM_VER}.tar.gz -O /usr/local/src/${CHARMM_VER}.tar.gz
RUN mkdir -p /usr/local/src/charmm && \
    tar -zxvf /usr/local/src/${CHARMM_VER}.tar.gz -C /usr/local/src && \
    rm /usr/local/src/${CHARMM_VER}.tar.gz && \
    cd /usr/local/src/charmm && \
    ./configure && \
    make -j$(nproc) -C build/cmake install && \
    strip /usr/local/src/charmm/bin/charmm || true


# -----------------------------------------------------------------------------
# Miniforge / Conda base build stage
FROM build_charmm AS install-conda
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/opt/envs/base" && \
    rm Miniforge3-$(uname)-$(uname -m).sh
ENV PATH="/opt/envs/base/bin:${PATH}"
RUN conda install --yes -p /opt/envs/base -c conda-forge numpy scipy matplotlib \
    pillow numba h5py cython reportlab \
    dbus-python fabio pyfai hdf5plugin \
    mmcif_pdbx svglib python-igraph biopython && \
    conda clean -afy

# -----------------------------------------------------------------------------
# Install IMP (FoXS & multi_foXS)
FROM install-conda AS install-imp
RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common && \
    add-apt-repository ppa:salilab/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends imp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Install SANS tools, Pepsi-SANS, and Python deps
FROM install-imp AS install-sans-tools
RUN apt-get update && \
    apt-get install -y parallel && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
RUN conda install --yes -p /opt/envs/base -c conda-forge pandas dask && \
    conda clean -afy
RUN pip install lmfit
WORKDIR /tmp
RUN wget https://bl1231.als.lbl.gov/pickup/pepsisans/Pepsi-SANS-Linux.zip -O Pepsi-SANS-Linux.zip && \
    unzip Pepsi-SANS-Linux.zip && \
    mv Pepsi-SANS /usr/local/bin && \
    rm Pepsi-SANS-Linux.zip && \
    strip /usr/local/bin/Pepsi-SANS || true
COPY apps/worker/scripts/sans /usr/local/sans

# -----------------------------------------------------------------------------
# Build OpenMM from source and install
FROM install-sans-tools AS openmm-build
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git build-essential cmake gfortran make wget ca-certificates bzip2 tar swig && \
    rm -rf /var/lib/apt/lists/*
RUN conda update -y -p /opt/envs/base -c defaults conda && \
    conda create -y -p /opt/envs/openmm python=${PYTHON_VERSION} openmm=${OPENMM_VERSION} numpy doxygen pip cython pyyaml && \
    conda clean -afy
ENV PATH=/opt/envs/openmm/bin:/opt/envs/base/bin:${PATH}


# -----------------------------------------------------------------------------
# Build & install PDBFixer into the openmm env
FROM openmm-build AS pdbfixer-build
WORKDIR /tmp
RUN git clone https://github.com/openmm/pdbfixer.git && \
    cd pdbfixer && \
    python setup.py install

# -----------------------------------------------------------------------------
# install PyMOL
FROM pdbfixer-build AS install-pymol
# Install build dependencies for PyMOL
RUN apt-get update && \
    apt-get install -y \
    git \
    wget \
    build-essential \
    cmake \
    libglew-dev \
    libpng-dev \
    libfreetype6-dev \
    libxml2-dev \
    libmsgpack-dev \
    libglm-dev \
    libnetcdf-dev \
    freeglut3-dev \
    libxmu-dev \
    libxi-dev \
    ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
# Install MMTF C++ library
RUN git clone https://github.com/rcsb/mmtf-cpp.git /tmp/mmtf-cpp && \
    cd /tmp/mmtf-cpp && \
    cmake . && \
    make install && \
    rm -rf /tmp/mmtf-cpp
# Clone PyMOL source code
RUN git clone https://github.com/schrodinger/pymol-open-source.git /tmp/pymol-open-source

# Build and install PyMOL
WORKDIR /tmp/pymol-open-source
RUN pip install .

# Verify PyMOL installation
RUN python -c "import pymol; print('PyMOL installed successfully')"

# Set working directory back to root
WORKDIR /

# Clean up build artifacts
RUN rm -rf /tmp/pymol-open-source

# -----------------------------------------------------------------------------
# No packing: keep envs at final runtime paths and copy them directly

# -----------------------------------------------------------------------------
# Slim final runtime image (CUDA runtime only)
FROM nvidia/cuda:12.9.1-runtime-ubuntu22.04 AS bilbomd-worker-base

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl software-properties-common \
    libgfortran5 libstdc++6 libxml2 libtiff5 liblzma5 libicu70 libharfbuzz0b \
    parallel binutils \
    libglew-dev \
    libpng-dev \
    libfreetype6-dev \
    libxml2-dev \
    libmsgpack-dev \
    libglm-dev \
    libnetcdf-dev \
    freeglut3-dev \
    libxmu-dev \
    libxi-dev \
    ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN add-apt-repository -y ppa:salilab/ppa && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends imp && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /bilbomd/uploads /bilbomd/logs /opt/envs/openmm /opt/envs/base

# ---- Copy runtime artifacts from builder stages ----
COPY --from=build_charmm /usr/local/src/charmm/bin/charmm /usr/local/bin/charmm
COPY --from=install-sans-tools /usr/local/bin/Pepsi-SANS /usr/local/bin/Pepsi-SANS
COPY --from=install-sans-tools /usr/local/sans /usr/local/sans
COPY --from=install-pymol /opt/envs/openmm /opt/envs/openmm
COPY --from=install-pymol /opt/envs/base   /opt/envs/base

ENV PATH="/opt/envs/openmm/bin:/opt/envs/base/bin:${PATH}"

RUN find /opt/envs -type d -name "__pycache__" -prune -exec rm -rf {} + || true && \
    find /opt/envs -type f -name "*.py[co]" -delete || true && \
    find /opt/envs -type f -name "*.a" -delete || true && \
    find /opt/envs -type f -name "*.la" -delete || true

# ---- Smoke test script installation ----
COPY apps/worker/scripts/smoke_test.sh /usr/local/bin/smoke_test.sh
RUN chmod +x /usr/local/bin/smoke_test.sh