# -----------------------------------------------------------------------------
# Setup the base image for building
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS install-dependencies

RUN apt-get update && \
    apt-get install -y cmake gcc gfortran g++ wget libgl1-mesa-dev \
    build-essential libarchive13 zip python3-launchpadlib curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Build CHARMM
FROM install-dependencies AS build_charmm
ARG CHARMM_VER=c49b1
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
# Install BioXTAS RAW
FROM install-conda AS install-bioxtas-raw
WORKDIR /tmp
RUN wget https://github.com/jbhopkins/bioxtasraw/archive/refs/heads/master.zip -O bioxtasraw-master.zip && \
    unzip bioxtasraw-master.zip && rm bioxtasraw-master.zip
WORKDIR /tmp/bioxtasraw-master
RUN python setup.py build_ext --inplace && \
    pip install . && \
    rm -rf /tmp/bioxtasraw-master

# -----------------------------------------------------------------------------
# Install IMP (FoXS & multi_foXS)
FROM install-bioxtas-raw AS install-imp
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
COPY scripts/sans /usr/local/sans

# -----------------------------------------------------------------------------
# Install ATSAS
FROM install-sans-tools AS install-atsas
RUN apt-get update && \
    apt-get install -y shared-mime-info libxkbcommon-x11-0 libxcb-cursor0 libxcb-icccm4 \
    libxcb-keysyms1 libxcb-shape0 libc6 libgcc-s1 libstdc++6 libxml2 libtiff5 liblzma5 libgfortran5 libicu70 libharfbuzz0b && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp
RUN wget https://bl1231.als.lbl.gov/pickup/atsas/ATSAS-4.0.1-1-Linux-Ubuntu-22.run -O ATSAS-4.0.1-1-Linux-Ubuntu-22.run && \
    wget https://bl1231.als.lbl.gov/pickup/atsas/atsas.lic -O atsas.lic
# Uncomment below to install ATSAS if needed
RUN mkdir /root/.local && chmod +x ATSAS-4.0.1-1-Linux-Ubuntu-22.run && \
    ./ATSAS-4.0.1-1-Linux-Ubuntu-22.run --accept-licenses --auto-answer \
    AutomaticRuntimeDependencyResolution=Yes --root /usr/local/ATSAS-4.0.1 --file-query KeyFilePath=/tmp/atsas.lic \
    --confirm-command install && rm ATSAS-4.0.1-1-Linux-Ubuntu-22.run

# -----------------------------------------------------------------------------
# Build OpenMM from source and install
FROM install-atsas AS openmm-build
ARG OPENMM_BRANCH=master
ARG OPENMM_PREFIX=/opt/openmm-${OPENMM_BRANCH}
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git build-essential cmake gfortran make wget ca-certificates bzip2 tar swig && \
    rm -rf /var/lib/apt/lists/*
RUN conda update -y -n base -c defaults conda && \
    conda create -y -n openmm python=3.12 numpy doxygen pip cython pyyaml && \
    conda clean -afy
ENV PATH=/miniforge3/envs/openmm/bin:/miniforge3/bin:${PATH}
WORKDIR /tmp
RUN git clone https://github.com/openmm/openmm.git && \
    cd openmm && \
    git checkout ${OPENMM_BRANCH} && \
    mkdir build && cd build && \
    cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=${OPENMM_PREFIX} \
    -DOPENMM_BUILD_PYTHON_WRAPPERS=ON \
    -DPYTHON_EXECUTABLE=/miniforge3/envs/openmm/bin/python \
    -DSWIG_EXECUTABLE=/usr/bin/swig \
    -DOPENMM_BUILD_CUDA_LIB=ON \
    -DCUDA_TOOLKIT_ROOT_DIR=/usr/local/cuda && \
    make -j"$(nproc)" && \
    make install && \
    make PythonInstall && \
    ldconfig

# -----------------------------------------------------------------------------
# Build & install PDBFixer into the openmm env
FROM openmm-build AS pdbfixer-build
WORKDIR /tmp
RUN git clone https://github.com/openmm/pdbfixer.git && \
    cd pdbfixer && \
    python setup.py install

# -----------------------------------------------------------------------------
# Pack conda envs (base + openmm) to copy only runtime artifacts
FROM pdbfixer-build AS pack-openmm-env
RUN conda install -y -n base  -c conda-forge conda-pack && \
    conda install -y -n openmm -c conda-forge conda-pack && \
    conda clean -afy
RUN conda run -n openmm conda-pack -n openmm -o /tmp/openmm-env.tar.gz
RUN conda run -n base   conda-pack -p /miniforge3 -o /tmp/base-env.tar.gz

# -----------------------------------------------------------------------------
# Slim final runtime image (CUDA runtime only)
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS bilbomd-worker-base

ARG OPENMM_BRANCH=master
ARG OPENMM_PREFIX=/opt/openmm-${OPENMM_BRANCH}

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl software-properties-common \
    libgfortran5 libstdc++6 libxml2 libtiff5 liblzma5 libicu70 libharfbuzz0b \
    parallel binutils && \
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
COPY --from=openmm-build ${OPENMM_PREFIX} ${OPENMM_PREFIX}
# COPY --from=install-atsas /usr/local/ATSAS-4.0.1/Licenses /usr/local/ATSAS-4.0.1/Licenses
COPY --from=install-atsas /usr/local/ATSAS-4.0.1/atsas.lic /usr/local/ATSAS-4.0.1/atsas.lic
COPY --from=install-atsas /usr/local/ATSAS-4.0.1/bin /usr/local/ATSAS-4.0.1/bin
COPY --from=install-atsas /usr/local/ATSAS-4.0.1/lib /usr/local/ATSAS-4.0.1/lib
COPY --from=install-atsas /usr/local/ATSAS-4.0.1/share /usr/local/ATSAS-4.0.1/share
COPY --from=pack-openmm-env /tmp/openmm-env.tar.gz /tmp/openmm-env.tar.gz
COPY --from=pack-openmm-env /tmp/base-env.tar.gz   /tmp/base-env.tar.gz
RUN mkdir -p /opt/envs/openmm /opt/envs/base && \
    cd /opt/envs/openmm && tar -xzf /tmp/openmm-env.tar.gz && ./bin/conda-unpack || true && \
    cd /opt/envs/base   && tar -xzf /tmp/base-env.tar.gz   && ./bin/conda-unpack || true && \
    rm -f /tmp/openmm-env.tar.gz /tmp/base-env.tar.gz

RUN set -eux; \
    find /opt/envs -type d -name "__pycache__" -prune -exec rm -rf {} +; \
    find /opt/envs -type f -name "*.py[co]" -delete; \
    # find /opt/envs -type d \( -name tests -o -name test -o -name testing \) -prune -exec rm -rf {} +; \
    find /opt/envs -type f -name "*.a" -delete; \
    find /opt/envs -type f -name "*.la" -delete; \
    strip --strip-unneeded ${OPENMM_PREFIX}/lib/libOpenMM*.so || true; \
    strip --strip-unneeded ${OPENMM_PREFIX}/lib/plugins/*.so || true

# ---- Runtime environment ----
ENV OPENMM_HOME="${OPENMM_PREFIX}"
ENV OPENMM_DIR="${OPENMM_PREFIX}"
ENV OPENMM_INCLUDE_DIR="${OPENMM_PREFIX}/include"
ENV OPENMM_LIBRARY="${OPENMM_PREFIX}/lib"
ENV OPENMM_LIBRARIES="${OPENMM_PREFIX}/lib"
ENV OPENMM_PLUGIN_DIR="${OPENMM_PREFIX}/lib/plugins"

ENV ATSAS="/usr/local/ATSAS-4.0.1"
ENV PATH="${ATSAS}/bin:${PATH}"

# ---- Smoke test OpenMM installation ----
COPY scripts/smoke_test.sh /usr/local/bin/smoke_test.sh