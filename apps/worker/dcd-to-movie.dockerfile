FROM ubuntu:24.04 AS build

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
# --------------------------------------------------------------------------------------
# Miniforge / Conda base build stage
FROM build AS install-conda
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh
ENV PATH="/miniforge3/bin/:${PATH}"

# Install PyMOL dependencies via conda
RUN conda install --yes --name base -c conda-forge \
    python=3.12 \
    setuptools \
    pip \
    numpy \
    && conda clean -afy

# Install build dependencies via pip
RUN pip install build wheel

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

# copy in our dcd to movie script
COPY scripts/pymol/make_dcd_movie.py /usr/local/bin/make_dcd_movie.py


