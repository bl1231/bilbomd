# -----------------------------------------------------------------------------
# Build stage 1 - build external dependencies of Scoper
FROM pytorch/pytorch:latest as bilbomd-scoper-build-deps
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Los_Angeles
RUN apt-get update && apt-get install -y build-essential git cmake libgsl-dev

# Clone and build 'reduce'
WORKDIR /usr/local/src/reduce
RUN git clone https://github.com/rlabduke/reduce.git . && \
    make && make install

# Clone and build 'KGS'
WORKDIR /usr/local/src/KGS
RUN git clone https://github.com/ExcitedStates/KGS.git .
RUN sed -i 's/option(ForceGSL "ForceGSL" OFF)/option(ForceGSL "ForceGSL" ON)/' src/CMakeLists.txt
WORKDIR /usr/local/src/KGS/build
RUN cmake -DCMAKE_BUILD_TYPE=Release ../src
RUN make -j
RUN rm -rf /var/lib/apt/lists/*

# Clone and build 'RNAview'
WORKDIR /usr/local/src/RNAView
RUN git clone https://github.com/rcsb/RNAView.git .
RUN make

# -----------------------------------------------------------------------------
# Build stage 2 - install the build artifacts into a clean image
FROM pytorch/pytorch:latest as bilbomd-scoper-install-deps
# Update and install necessary packages
RUN apt-get update && apt-get install -y wget curl unzip git libgsl-dev
# Copy reduce
COPY --from=bilbomd-scoper-build-deps /usr/local/bin/reduce /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/reduce_wwPDB_het_dict.txt /usr/local/
# Copy kgs_explore
COPY --from=bilbomd-scoper-build-deps /usr/local/src/KGS/build/kgs_explore /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/src/KGS/scripts/kgs_prepare.py /usr/local/bin/
# Copy RNAView binary
COPY --from=bilbomd-scoper-build-deps /usr/local/src/RNAView/bin/rnaview /usr/local/bin/
COPY --from=bilbomd-scoper-build-deps /usr/local/src/RNAView/BASEPARS /usr/local/RNAView/BASEPARS

# -----------------------------------------------------------------------------
# Build stage 3 - install NodeJS v18
FROM bilbomd-scoper-install-deps AS bilbomd-scoper-nodejs
ARG NODE_MAJOR=20
RUN apt-get update
RUN apt-get install -y gpg curl
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install -y nodejs

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
RUN conda install -y imp=2.19.0

# Get BunJS setup for the eventual WebApp
# Create a new user 'bun'
#RUN useradd -ms /bin/bash bun
# Create a group with GID
RUN groupadd -g $GROUP_ID bun

# Create the 'bun' user with specified UID and GID
RUN useradd -ms /bin/bash -u $USER_ID -g $GROUP_ID bun

# Not sure this is needed, but chown everything
RUN chown -R bun:bun /home/bun

# Set the user for subsequent instructions
USER bun:bun

WORKDIR /home/bun
# RUN curl -fsSL https://bun.sh/install | bash

# RUN echo 'export BUN_INSTALL="$HOME/.bun"' >> /home/bun/.bashrc && \
    # echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> /home/bun/.bashrc

# Set BUN_INSTALL and add it to the PATH for subsequent commands and runtime
# ENV BUN_INSTALL="/home/bun/.bun"
# ENV PATH="$BUN_INSTALL/bin:$PATH"

# Change back to the app directory
WORKDIR /home/bun/app

# Copy package.json and bun.lockb to the container
# COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun package*.json ./

# Install any dependencies
# RUN bun install
RUN npm ci

# Clone IonNet
WORKDIR /home/bun/IonNet
RUN git clone -b docker-test https://github.com/bl1231/IonNet.git .
WORKDIR /home/bun/IonNet/scripts/scoper_scripts
RUN tar xvf KGSrna.tar

# Change back to the app directory
WORKDIR /home/bun/app
# Copy the rest of your app's source code
COPY --chown=bun:bun . .

# Set the RNAView env variable
ENV RNAVIEW=/usr/local/RNAView

CMD ["npm", "start"]
