# -----------------------------------------------------------------------------
# Build stage 1
FROM pytorch/pytorch:latest as build-stage-1
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
# Build stage 2
FROM pytorch/pytorch:latest as build-stage-2
# Update and install necessary packages
RUN apt-get update && apt-get install -y wget curl unzip git libgsl-dev
# Copy reduce
COPY --from=build-stage-1 /usr/local/bin/reduce /usr/local/bin/
COPY --from=build-stage-1 /usr/local/reduce_wwPDB_het_dict.txt /usr/local/
# Copy kgs_explore
COPY --from=build-stage-1 /usr/local/src/KGS/build/kgs_explore /usr/local/bin/
COPY --from=build-stage-1 /usr/local/src/KGS/scripts/kgs_prepare.py /usr/local/bin/
# Copy RNAView binary
COPY --from=build-stage-1 /usr/local/src/RNAView/bin/rnaview /usr/local/bin/
COPY --from=build-stage-1 /usr/local/src/RNAView/BASEPARS /usr/local/RNAView/BASEPARS

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
RUN groupadd -g 1231 bun

# Create the 'bun' user with specified UID and GID
RUN useradd -ms /bin/bash -u 5005 -g 1231 bun

# Not sure this is needed, but chown everything
RUN chown -R bun:bun /home/bun

# Set the user for subsequent instructions
USER bun

WORKDIR /home/bun
RUN curl -fsSL https://bun.sh/install | bash

RUN echo 'export BUN_INSTALL="$HOME/.bun"' >> /home/bun/.bashrc && \
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> /home/bun/.bashrc

# Set BUN_INSTALL and add it to the PATH for subsequent commands and runtime
ENV BUN_INSTALL="/home/bun/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Change back to the app directory
WORKDIR /home/bun/app

# Copy package.json and bun.lockb to the container
COPY --chown=bun:bun package.json bun.lockb* ./

# Install any dependencies
RUN bun install

# Clone IonNet
WORKDIR /home/bun/IonNet
RUN git clone -b docker-test https://github.com/bl1231/IonNet.git .

# Change back to the app directory
WORKDIR /home/bun/app
# Copy the rest of your app's source code
COPY --chown=bun:bun . .

# Set the RNAView env variable
ENV RNAVIEW=/usr/local/RNAView

# Your app binds to port 3005
EXPOSE 3005

# Run the Bun app
CMD ["bun", "run", "--hot","scoper.ts"]
