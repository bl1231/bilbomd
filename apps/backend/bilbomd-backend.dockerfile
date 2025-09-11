# --------------------------------------------------------------------------------------
# Build stage 1 - Install Miniforge3
# FROM node:22-slim AS bilbomd-backend-step1
FROM node:22 AS bilbomd-backend-step1

RUN apt-get update && \
    apt-get install -y ncat ca-certificates wget libgl1-mesa-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Download and install Miniforge3
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh

# Add Conda to PATH
ENV PATH="/miniforge3/bin/:${PATH}"

# Copy in the environment.yml file
COPY environment.yml /tmp/environment.yml

# Update existing conda base env from environment.yml
RUN conda env update -f /tmp/environment.yml && \
    rm /tmp/environment.yml && \
    conda clean -afy

# --------------------------------------------------------------------------------------
# Build stage 2 - Install BioXTAS
FROM bilbomd-backend-step1 AS bilbomd-backend-step2

# install deps
RUN apt-get update && \
    apt-get install -y curl zip build-essential libarchive13 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install BioXTAS from source
WORKDIR /tmp
#COPY bioxtas/bioxtasraw-master.zip .
RUN wget -q https://github.com/jbhopkins/bioxtasraw/archive/refs/heads/master.zip -O bioxtasraw-master.zip && \
    unzip bioxtasraw-master.zip && \
    rm bioxtasraw-master.zip

WORKDIR /tmp/bioxtasraw-master
RUN python setup.py build_ext --inplace && \
    pip install .

# --------------------------------------------------------------------------------------
# Build stage 3 - Install backend app
FROM bilbomd-backend-step2 AS bilbomd-backend
ARG USER_ID
ARG GROUP_ID
ARG GITHUB_TOKEN
ARG BILBOMD_BACKEND_GIT_HASH
ARG BILBOMD_BACKEND_VERSION
RUN mkdir -p /app/node_modules /bilbomd/uploads /bilbomd/logs
WORKDIR /app

# Create a user and group with the provided IDs
RUN groupadd -g $GROUP_ID bilbomd && \
    useradd -u $USER_ID -g $GROUP_ID -m -d /home/bilbo -s /bin/bash bilbo

# Change ownership of directories to the user and group
RUN chown -R bilbo:bilbomd /app /bilbomd/uploads /bilbomd/logs /home/bilbo

# Switch to the non-root user
USER bilbo:bilbomd

# Copy package.json and package-lock.json
COPY --chown=bilbo:bilbomd package*.json .

# Create .npmrc file using the build argument
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > /home/bilbo/.npmrc

# Install dependencies
RUN npm ci

# Remove .npmrc file for security
RUN rm /home/bilbo/.npmrc

# Clean up the environment variable for security
RUN unset GITHUB_TOKEN

# Copy entire backend app
COPY --chown=bilbo:bilbomd . .

# Use the ARG to set the environment variable
ENV BILBOMD_BACKEND_GIT_HASH=${BILBOMD_BACKEND_GIT_HASH}
ENV BILBOMD_BACKEND_VERSION=${BILBOMD_BACKEND_VERSION}
ENV NODE_DEBUG=openid-client

EXPOSE 3500

CMD [ "npm", "start" ]
