# Build stage 1
FROM nvidia/cuda:12.1.0-base-ubuntu20.04 as build-stage-1
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
RUN mkdir obj && make

# Build stage 2
FROM nvidia/cuda:12.1.0-base-ubuntu20.04 as build-stage-2
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

# Download and install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-py310_23.10.0-1-Linux-x86_64.sh -O /tmp/miniconda.sh && \
    bash /tmp/miniconda.sh -b -p /opt/miniconda && \
    rm /tmp/miniconda.sh

# Set up the Miniconda environment
ENV PATH="/opt/miniconda/bin:$PATH"

# Copy the environment.yml file into the image
COPY environment.yml /tmp/environment.yml

# Update existing base environment from environment.yml
RUN conda env update -f /tmp/environment.yml

# RUN conda install -y pytorch-cuda=11.6 -c pytorch -c nvidia
# RUN conda install -y pytorch=1.13.1 -c pytorch
RUN conda install -y pytorch pytorch-cuda -c pytorch -c nvidia
# RUN conda install -y pyg=2.2.0 -c pyg
RUN conda install -y pyg -c pyg

# RUN pip install torch-scatter -f https://data.pyg.org/whl/torch-1.13.1+cu117.html
# RUN pip install torch-sparse -f https://data.pyg.org/whl/torch-1.13.1+cu117.html
# RUN pip install torch-cluster -f https://data.pyg.org/whl/torch-1.13.1+cu117.html
# RUN pip install torch-spline-conv  -f https://data.pyg.org/whl/torch-1.13.1+cu117.html
RUN conda install -y torchmetrics=0.7.2 -c conda-forge

# Get BunJS setup for the eventual WebApp
# Create a new user 'bun'
RUN useradd -ms /bin/bash bun

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
# RUN /home/bun/.bun/bin/bun install
RUN bun install

# Clone IonNet into test-data
WORKDIR /home/bun/app/test-data/IonNet
RUN git clone https://github.com/dina-lab3D/IonNet .
# Extract these 2 deps
WORKDIR /home/bun/app/test-data/IonNet/scripts/scoper_scripts
RUN tar -xf RNAVIEW.tar
RUN tar -xf KGSrna.tar

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
# CMD ["tail", "-f", "/dev/null"]
