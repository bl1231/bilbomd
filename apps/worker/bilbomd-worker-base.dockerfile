# -----------------------------------------------------------------------------
# Setup the base image for building
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS install-dependencies

# Pin versions for better caching
ARG CHARMM_VER=c49b2
ARG OPENMM_VERSION=8.4.0
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
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh
ENV PATH="/miniforge3/bin/:${PATH}"
RUN conda install --yes --name base -c conda-forge numpy scipy matplotlib \
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
RUN conda install --yes --name base -c conda-forge pandas dask && \
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
RUN conda update -y -n base -c defaults conda && \
    conda create -y -n openmm python=${PYTHON_VERSION} openmm=${OPENMM_VERSION} numpy doxygen pip cython pyyaml && \
    conda clean -afy
ENV PATH=/miniforge3/envs/openmm/bin:/miniforge3/bin:${PATH}


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
# Pack conda envs (base + openmm) to copy only runtime artifacts
FROM install-pymol AS pack-openmm-env
RUN conda install -y -n base  -c conda-forge conda-pack && \
    conda install -y -n openmm -c conda-forge conda-pack && \
    conda clean -afy

# Check available disk space before packing
RUN df -h && echo "Available space before packing:"

# Clean up build artifacts first to free space
RUN find /miniforge3 -type d -name "__pycache__" -prune -exec rm -rf {} + || true && \
    find /miniforge3 -type f -name "*.py[co]" -delete || true && \
    conda clean -afy

# Pack smaller openmm environment first
RUN echo "Checking OpenMM environment..." && \
    conda info --envs && \
    conda list -n openmm | head -10 && \
    echo "Packing OpenMM environment..." && \
    conda run -n openmm conda-pack -n openmm -o /tmp/openmm-env.tar.gz && \
    echo "OpenMM env packed successfully" && df -h

# Pack base environment with compression optimization  
RUN echo "Packing base environment..." && \
    conda run -n base conda-pack -p /miniforge3 -o /tmp/base-env.tar.gz && \
    echo "Base env packed successfully" && df -h

# -----------------------------------------------------------------------------
# Slim final runtime image (CUDA runtime only)
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS bilbomd-worker-base

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
COPY --from=pack-openmm-env /tmp/openmm-env.tar.gz /tmp/openmm-env.tar.gz
COPY --from=pack-openmm-env /tmp/base-env.tar.gz   /tmp/base-env.tar.gz
RUN mkdir -p /opt/envs/openmm /opt/envs/base && \
    cd /opt/envs/openmm && tar -xzf /tmp/openmm-env.tar.gz && ./bin/conda-unpack || true && \
    cd /opt/envs/base   && tar -xzf /tmp/base-env.tar.gz   && ./bin/conda-unpack || true && \
    rm -f /tmp/openmm-env.tar.gz /tmp/base-env.tar.gz

RUN find /opt/envs -type d -name "__pycache__" -prune -exec rm -rf {} + || true && \
    find /opt/envs -type f -name "*.py[co]" -delete || true && \
    find /opt/envs -type f -name "*.a" -delete || true && \
    find /opt/envs -type f -name "*.la" -delete || true

# ---- Smoke test script installation ----
COPY apps/worker/scripts/smoke_test.sh /usr/local/bin/smoke_test.sh
RUN chmod +x /usr/local/bin/smoke_test.sh