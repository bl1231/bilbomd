# --- Build stage: compile OpenMM from source and install Python wrappers ---
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Pick the OpenMM version and install prefix at build-time
# ARG OPENMM_VERSION=8.1.2
ARG OPENMM_BRANCH=main
ARG OPENMM_PREFIX=/opt/openmm-${OPENMM_BRANCH}

# Basic build deps + SWIG for Python wrappers + Python headers
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git build-essential cmake gfortran make \
    wget ca-certificates bzip2 tar \
    swig python3 python3-dev && \
    rm -rf /var/lib/apt/lists/*

# --- Miniforge (Conda) ---
# Install Miniforge and create a clean Python env for the OpenMM Python wrappers
RUN wget -q "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" -O /tmp/miniforge.sh && \
    bash /tmp/miniforge.sh -b -p /miniforge3 && \
    rm /tmp/miniforge.sh

ENV PATH=/miniforge3/bin:${PATH}

RUN conda clean -a -y

RUN conda update -y -n base -c defaults conda && \
    conda create -y -n openmm python=3.12 numpy doxygen pip cython && \
    conda clean -afy

# Ensure the env is first on PATH for CMake to find the intended Python
ENV PATH=/miniforge3/envs/openmm/bin:/miniforge3/bin:${PATH}

# --- Build & install OpenMM ---
WORKDIR /tmp
RUN git clone https://github.com/openmm/openmm.git && \
    cd openmm && \
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

# --- Build & install PDBFixer ---
WORKDIR /tmp
RUN git clone https://github.com/openmm/pdbfixer.git && \
    cd pdbfixer && \
    python setup.py install

# --- Install other Python packages ---
RUN conda install -y -n openmm pyyaml && \
    conda clean -afy

# --- Runtime stage: slim image with CUDA runtime + OpenMM + conda env ---
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ARG OPENMM_BRANCH=main
ARG OPENMM_PREFIX=/opt/openmm-${OPENMM_BRANCH}

# Copy the conda env and the compiled OpenMM install from the builder
COPY --from=builder /miniforge3 /miniforge3
COPY --from=builder ${OPENMM_PREFIX} ${OPENMM_PREFIX}
RUN /miniforge3/envs/openmm/bin/python -m pip install --no-deps --no-build-isolation pdbfixer

# Runtime environment
ENV PATH=/miniforge3/envs/openmm/bin:/miniforge3/bin:${PATH}
ENV OPENMM_HOME=${OPENMM_PREFIX}
ENV OPENMM_PLUGIN_DIR=${OPENMM_PREFIX}/lib/plugins
ENV LD_LIBRARY_PATH=${OPENMM_PREFIX}/lib:${LD_LIBRARY_PATH}

# Make sure the dynamic linker can find the OpenMM libs without setting LD_LIBRARY_PATH
RUN echo "${OPENMM_PREFIX}/lib" > /etc/ld.so.conf.d/openmm.conf && ldconfig

# copy in the bilbomd worker code
COPY scripts/openmm /app/scripts/openmm

# (Optional) verify python import during build
RUN python -c "import openmm, sys; print('OpenMM', openmm.__version__, 'Python', sys.version)"