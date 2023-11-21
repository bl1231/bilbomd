# Build stage 1
FROM oven/bun:debian as build-stage
RUN apt-get update && apt-get install -y build-essential git

# Clone and build 'reduce'
WORKDIR /usr/local/src/reduce
RUN git clone https://github.com/rlabduke/reduce.git . && \
    make && make install

# Build stage 2
FROM oven/bun:debian
# Update and install necessary packages
RUN apt-get update && apt-get install -y wget git
COPY --from=build-stage /usr/local/bin/reduce /usr/local/bin/reduce

# Clone IonNet
WORKDIR /home/bun/IonNet
RUN git clone https://github.com/dina-lab3D/IonNet .

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

# Change back to the app directory
WORKDIR /home/bun/app

# Copy package.json and bun.lockb to the container
COPY --chown=bun:bun package.json bun.lockb* ./

# Install any dependencies
RUN bun install

# Copy the rest of your app's source code
COPY --chown=bun:bun . .

# Your app binds to port 3005
EXPOSE 3005

# Run the Bun app
CMD ["bun", "run", "--hot","scoper.ts"]
