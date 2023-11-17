# https://hub.docker.com/r/oven/bun
FROM oven/bun:debian
RUN apt-get update && apt-get install -y wget

# Download the Miniconda installer script
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/miniconda.sh

# Run the Miniconda installer
RUN bash /tmp/miniconda.sh -b -p /opt/miniconda

# Clean up
RUN rm /tmp/miniconda.sh

# Set up the Miniconda environment
ENV PATH="/opt/miniconda/bin:$PATH"

# Copy package.json and bun.lockb to the container
COPY package.json bun.lockb* ./

# Install any dependencies
RUN bun install

# Copy the rest of your app's source code
COPY . .

# Your app binds to port 3005
EXPOSE 3005

# Run the Bun app
CMD ["bun", "run", "--hot","scoper.ts"]
