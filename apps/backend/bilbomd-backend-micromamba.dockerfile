# -----------------------------------------------------------------------------
# Build stage 1
FROM mambaorg/micromamba:jammy AS bilbomd-backend-setup

# Switch to root to install packages
USER root

RUN apt-get update && \
    apt-get install -y curl bzip2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Install Node.js
FROM bilbomd-backend-setup AS bilbomd-backend-nodejs
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Install BioXTAS
FROM bilbomd-backend-nodejs AS bilbomd-backend-bioxtasraw

# install deps
RUN apt-get update && \
    apt-get install -y curl zip build-essential libarchive13 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Switch back to mambauser user
USER mambauser

# Install BioXTAS dependencies
RUN micromamba install --yes --name base -c conda-forge numpy scipy matplotlib
RUN micromamba install --yes --name base -c conda-forge pillow numba h5py cython reportlab
RUN micromamba install --yes --name base -c conda-forge dbus-python fabio pyfai hdf5plugin
RUN micromamba install --yes --name base -c conda-forge mmcif_pdbx svglib python-igraph
RUN micromamba install --yes --name base pip

USER root

WORKDIR /home/mambauser
COPY bioxtas/bioxtasraw-master.zip .
RUN unzip bioxtasraw-master.zip && \
    rm bioxtasraw-master.zip

WORKDIR /home/mambauser/bioxtasraw-master
ARG MAMBA_DOCKERFILE_ACTIVATE=1
RUN python setup.py build_ext --inplace
RUN pip install .

# -----------------------------------------------------------------------------
# Install bilbomd-backend app
FROM bilbomd-backend-bioxtasraw AS bilbomd-backend
ARG USER_ID
ARG GROUP_ID
ARG GITHUB_TOKEN
ARG BILBOMD_BACKEND_GIT_HASH
ARG BILBOMD_BACKEND_VERSION
RUN mkdir -p /secrets /bilbomd/uploads /bilbomd/logs
WORKDIR /app

# Create a user and group with the provided IDs
RUN groupadd -g $GROUP_ID bilbomd && \
    useradd -u $USER_ID -g $GROUP_ID -m -d /home/bilbo -s /bin/bash bilbo

# Change ownership of directories to the user and group
RUN chown -R bilbo:bilbomd /app /bilbomd/uploads /bilbomd/logs /home/bilbo

# Update NPM
RUN npm install -g npm@10.9.0

# Switch to the non-root user
USER bilbo:bilbomd

# Configure bilbo bash shell for micromamba
RUN micromamba shell init --shell bash

# Copy package.json and package-lock.json
COPY --chown=bilbo:bilbomd package*.json .

# Create .npmrc file using the build argument
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > /home/bilbo/.npmrc

# Install dependencies
RUN npm ci --no-audit

# Remove .npmrc file for security
RUN rm /home/bilbo/.npmrc

# Clean up the environment variable for security
RUN unset GITHUB_TOKEN

# Copy entire backend app
COPY --chown=bilbo:bilbomd . .

# Use the ARG to set the environment variable
ENV BILBOMD_BACKEND_GIT_HASH=${BILBOMD_BACKEND_GIT_HASH}
ENV BILBOMD_BACKEND_VERSION=${BILBOMD_BACKEND_VERSION}

EXPOSE 3500

CMD [ "npm", "start" ]
