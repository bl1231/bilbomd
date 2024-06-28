# -----------------------------------------------------------------------------
# Build stage 1 - build external dependencies of Scoper
FROM pytorch/pytorch:latest as bilbomd-scoper-build-deps
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Los_Angeles

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential \
        git \
        cmake \
        unzip \
        libgsl-dev && \
    rm -rf /var/lib/apt/lists/*

# Clone and build 'reduce'
WORKDIR /usr/local/src
RUN git clone https://github.com/rlabduke/reduce.git reduce && \
    cd reduce && \
    make && make install

# Clone and build 'KGS'
# We are not yet using this version of KGS
# but we really need to figure it out.
# RUN git clone https://github.com/ExcitedStates/KGS.git KGS && \
#     sed -i 's/option(ForceGSL "ForceGSL" OFF)/option(ForceGSL "ForceGSL" ON)/' KGS/src/CMakeLists.txt && \
#     mkdir KGS/build && \
#     cd KGS/build && \
#     cmake -DCMAKE_BUILD_TYPE=Release ../src && \
#     make -j

# Clone and build 'RNAview'
WORKDIR /usr/local
# RUN curl -L -o rnaview.zip https://github.com/rcsb/RNAView/archive/refs/heads/master.zip
COPY rnaview/rnaview.zip .
# RUN git clone https://github.com/rcsb/RNAView.git RNAView && \
RUN unzip rnaview.zip && \
    mv RNAView-master RNAView && \
    cd RNAView && \
    make


# -----------------------------------------------------------------------------
# Build stage 2 - install the build artifacts into a clean image
FROM pytorch/pytorch:latest as bilbomd-scoper-install-deps
# Update and install necessary packages
RUN apt-get update && apt-get install -y wget curl unzip git libgsl-dev
# Copy reduce
COPY --from=bilbomd-scoper-build-deps /usr/local/bin/reduce /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/reduce_wwPDB_het_dict.txt /usr/local/
# Copy kgs_explore
# COPY --from=bilbomd-scoper-build-deps /usr/local/src/KGS/build/kgs_explore /usr/local/bin/
# COPY --from=bilbomd-scoper-build-deps /usr/local/src/KGS/scripts/kgs_prepare.py /usr/local/bin/
# Copy RNAView binary
COPY --from=bilbomd-scoper-build-deps /usr/local/RNAView/bin/rnaview /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/RNAView/BASEPARS /usr/local/RNAView/BASEPARS


# -----------------------------------------------------------------------------
# Build stage 3 - install NodeJS
FROM bilbomd-scoper-install-deps AS bilbomd-scoper-nodejs
ARG NODE_MAJOR=20

# Install necessary packages, configure NodeSource repository, and install Node.js
RUN apt-get update && \
    apt-get install -y gpg curl libjpeg-dev libpng-dev && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*


# -----------------------------------------------------------------------------
# Build stage 4
FROM bilbomd-scoper-nodejs AS bilbomd-scoper-pyg
ARG USER_ID
ARG GROUP_ID

# Update Conda
RUN conda update -n base -c defaults conda

# Copy the environment.yml file into the image
COPY environment.yml /tmp/environment.yml

# Update existing base environment from environment.yml
RUN conda env update -f /tmp/environment.yml && \
    conda install -y pyg=2.4.0 -c pyg && \
    conda install -y torchmetrics=0.7.2 -c conda-forge && \
    conda install -y tabulate && \
    conda install -y imp=2.19.0 && \
    pip install wandb

RUN groupadd -g $GROUP_ID scoper && \
    useradd -ms /bin/bash -u $USER_ID -g $GROUP_ID scoper && \
    mkdir -p /home/scoper/app && \
    chown -R scoper:scoper /home/scoper

RUN npm install -g npm@10.8.1

# -----------------------------------------------------------------------------
# Build stage 4.1111
FROM bilbomd-scoper-pyg AS bilbomd-scoper
ARG NPM_TOKEN

# Switch to scoper user
USER scoper:scoper

# Copy IonNet source code
WORKDIR /home/scoper
COPY ionnet/docker-test.zip .
RUN unzip docker-test.zip && \
    mv IonNet-docker-test IonNet && \
    cd IonNet/scripts/scoper_scripts && \
    tar xvf KGSrna.tar

# Change back to the app directory
WORKDIR /home/scoper/app

# Copy package.json and package-lock.json
COPY --chown=scoper:scoper package*.json ./

# Update NPM and install dependencies
RUN echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" > /home/scoper/.npmrc && \
    npm install && \
    unset NPM_TOKEN

# Copy application source code
COPY --chown=scoper:scoper . .

# Set environment variable
ENV RNAVIEW=/usr/local/RNAView

# Set the default command
CMD ["npm", "start"]
