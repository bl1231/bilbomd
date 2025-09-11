# Use an official NVIDIA image as a parent image
FROM nvidia/cuda:12.2.2-devel-ubuntu22.04
ARG USER_ID

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    wget \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libssl-dev \
    libffi-dev \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Check the installed gcc version
RUN gcc --version

# CHeck NVCC version
RUN nvcc --version

# Create working dir for installing LocalColabFold
WORKDIR /app

# Download & Execute the LocalColabFold install script
RUN wget https://raw.githubusercontent.com/YoshitakaMo/localcolabfold/main/install_colabbatch_linux.sh && \
    bash install_colabbatch_linux.sh && \
    rm install_colabbatch_linux.sh

# Update the PATH environment variable
ENV PATH="/app/localcolabfold/colabfold-conda/bin:/app/scripts:$PATH"

COPY scripts/nersc/gen-bilbomd-slurm-file.sh scripts/
COPY scripts/pdb2crd.py scripts/

RUN chown -R $USER_ID:0 /app