FROM ubuntu:22.04 AS builder

RUN apt-get update && \
    apt-get install -y wget zip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Build stage 1 - Miniconda3
FROM builder AS build-conda

# Download and install Miniforge3
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh

# Add Conda to PATH
ENV PATH="/miniforge3/bin/:${PATH}"

# Update conda & install deps
RUN conda update -y -n base -c defaults conda && \
    conda install -y numpy scipy pandas dask && \
    conda clean -afy

# pip install lmfit
RUN pip install lmfit

# -----------------------------------------------------------------------------
# Build stage 2 - Pepsi-SANS
FROM build-conda AS build-pepsi-sans
#RUN wget "https://files.inria.fr/NanoDFiles/Website/Software/Pepsi-SANS/Linux/3.0/Pepsi-SANS-Linux.zip" && \
COPY pepsisans/Pepsi-SANS-Linux.zip .
RUN  unzip Pepsi-SANS-Linux.zip && \
    rm Pepsi-SANS-Linux.zip

# -----------------------------------------------------------------------------
# Build stage 3 - Install GASANS Python script
FROM build-pepsi-sans AS gasans
COPY scripts/sans /usr/local/sans


