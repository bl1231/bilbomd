# --- Build stage: compile OpenMM from source and install Python wrappers ---
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

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
    conda create -y -n openmm python=3.12 openmm=8.4.0 pyyaml numpy doxygen pip cython && \
    conda clean -afy

# Ensure the env is first on PATH for CMake to find the intended Python
ENV PATH=/miniforge3/envs/openmm/bin:/miniforge3/bin:${PATH}

# --- Build & install PDBFixer ---
WORKDIR /tmp
RUN git clone https://github.com/openmm/pdbfixer.git && \
    cd pdbfixer && \
    python setup.py install


# --- Runtime stage: slim image with CUDA runtime + OpenMM + conda env ---
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

# Copy the conda env and the compiled OpenMM install from the builder
COPY --from=builder /miniforge3 /miniforge3

# Runtime environment
ENV PATH=/miniforge3/envs/openmm/bin:/miniforge3/bin:${PATH}

# copy in the bilbomd worker code
COPY apps/worker/scripts/openmm /app/scripts/openmm
