# -----------------------------------------------------------------------------
# Build stage 1 - build external dependencies of Scoper
FROM pytorch/pytorch:latest as bilbomd-scoper-build-deps
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Los_Angeles

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential git cmake libgsl-dev && \
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
RUN git clone https://github.com/rcsb/RNAView.git RNAView && \
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
COPY --from=bilbomd-scoper-build-deps /usr/local/src/RNAView/bin/rnaview /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/src/RNAView/BASEPARS /usr/local/RNAView/BASEPARS


# -----------------------------------------------------------------------------
# Build stage 3 - install NodeJS
FROM bilbomd-scoper-install-deps AS bilbomd-scoper-nodejs
ARG NODE_MAJOR=20

# Install necessary packages, configure NodeSource repository, and install Node.js
RUN apt-get update && \
    apt-get install -y gpg curl && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*


# -----------------------------------------------------------------------------
# Build stage 4
FROM bilbomd-scoper-nodejs AS bilbomd-scoper

ARG USER_ID=1001
ARG GROUP_ID=1001

# Update Conda
RUN conda update -n base -c defaults conda

# Copy the environment.yml file into the image
COPY environment.yml /tmp/environment.yml

# Update existing base environment from environment.yml
RUN conda env update -f /tmp/environment.yml
RUN conda install -y pyg -c pyg
RUN conda install -y torchmetrics=0.7.2 -c conda-forge
RUN conda install -y tabulate
RUN conda install -y imp=2.20.1
RUN pip install wandb

# Create a group with GID
RUN groupadd -g $GROUP_ID scoper

# Create the 'scoper' user with specified UID and GID
RUN useradd -ms /bin/bash -u $USER_ID -g $GROUP_ID scoper

# Not sure this is needed, but chown everything
RUN chown -R scoper:scoper /home/scoper

# Set the user for subsequent instructions
USER scoper:scoper

# Change back to the app directory
WORKDIR /home/scoper/app

# Copy package.json and package-lock.json
COPY --chown=scoper:scoper package*.json ./

# Install any NPM dependencies
RUN npm install

# Clone IonNet
WORKDIR /home/scoper/IonNet
RUN git clone -b docker-test https://github.com/bl1231/IonNet.git .
WORKDIR /home/scoper/IonNet/scripts/scoper_scripts
RUN tar xvf KGSrna.tar

# Change back to the app directory
WORKDIR /home/scoper/app
# Copy the rest of your app's source code
COPY --chown=scoper:scoper . .

# Set the RNAView env variable
ENV RNAVIEW=/usr/local/RNAView

CMD ["npm", "start"]
