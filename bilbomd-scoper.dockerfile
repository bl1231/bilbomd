# -----------------------------------------------------------------------------
# Build stage 1 - build external dependencies of Scoper
FROM pytorch/pytorch:latest AS bilbomd-scoper-build-deps
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Los_Angeles

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential \
    git \
    cmake \
    unzip \
    curl \
    libgsl-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Clone and build 'reduce'
WORKDIR /usr/local/src
RUN git clone https://github.com/rlabduke/reduce.git reduce && \
    cd reduce && \
    make && make install && \
    rm -rf /usr/local/src/reduce

# Clone and build 'RNAview'
WORKDIR /usr/local
RUN curl -L -o rnaview.zip https://github.com/rcsb/RNAView/archive/refs/heads/master.zip
# COPY rnaview/rnaview.zip .
# RUN git clone https://github.com/rcsb/RNAView.git RNAView && \
RUN unzip rnaview.zip && \
    mv RNAView-master RNAView && \
    cd RNAView && \
    make && \
    rm /usr/local/rnaview.zip


# -----------------------------------------------------------------------------
# Build stage 2 - install the build artifacts into a clean image
FROM pytorch/pytorch:latest AS bilbomd-scoper-install-deps
# Update and install necessary packages
RUN apt-get update && \
    apt-get install -y wget curl unzip git libgsl-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
# Copy reduce
COPY --from=bilbomd-scoper-build-deps /usr/local/bin/reduce /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/reduce_wwPDB_het_dict.txt /usr/local/
# Copy RNAView binary
COPY --from=bilbomd-scoper-build-deps /usr/local/RNAView/bin/rnaview /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/RNAView/BASEPARS /usr/local/RNAView/BASEPARS


# -----------------------------------------------------------------------------
# Build stage 3 - install NodeJS v20
FROM bilbomd-scoper-install-deps AS bilbomd-scoper-nodejs
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# -----------------------------------------------------------------------------
# Build stage 4
FROM bilbomd-scoper-nodejs AS bilbomd-scoper-pyg
ARG USER_ID
ARG GROUP_ID

# Update Conda as per ChatGPT suggestion
RUN conda install -n base -c defaults conda=24.9.2
RUN conda config --add channels conda-forge

# Copy the environment.yml file into the image
COPY environment.yml /tmp/environment.yml

# Update existing base environment from environment.yml
RUN conda env update -f /tmp/environment.yml && \
    conda install -y pyg=2.4.0 -c pyg && \
    conda install -y torchmetrics=0.7.2 -c conda-forge && \
    conda install -y tabulate && \
    conda install -y imp=2.19.0 && \
    pip install wandb && \
    conda clean --all --yes

RUN groupadd -g $GROUP_ID scoper && \
    useradd -ms /bin/bash -u $USER_ID -g $GROUP_ID scoper && \
    mkdir -p /home/scoper/app && \
    chown -R scoper:scoper /home/scoper

# -----------------------------------------------------------------------------
# Build stage 4.1111
FROM bilbomd-scoper-pyg AS bilbomd-scoper
ARG GITHUB_TOKEN

# Switch to scoper user
USER scoper:scoper

# Copy IonNet source code
WORKDIR /home/scoper
# COPY ionnet/docker-test.zip .
RUN curl -L -o docker-test.zip https://github.com/bl1231/IonNet/archive/refs/heads/docker-test.zip
RUN unzip docker-test.zip && \
    mv IonNet-docker-test IonNet && \
    cd IonNet/scripts/scoper_scripts && \
    tar xvf KGSrna.tar && \
    rm KGSrna.tar

# Change back to the app directory
WORKDIR /home/scoper/app

# Copy package.json and package-lock.json
COPY --chown=scoper:scoper package*.json .

# Update NPM and install dependencies
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > /home/scoper/.npmrc

RUN npm ci --no-audit

# Remove .npmrc file for security
RUN rm /home/scoper/.npmrc

# Clean up the environment variable for security
RUN unset GITHUB_TOKEN

# Copy application source code
COPY --chown=scoper:scoper . .

# Set environment variable
ENV RNAVIEW=/usr/local/RNAView

# Set the default command
CMD ["npm", "start"]
