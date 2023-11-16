# https://hub.docker.com/r/oven/bun
FROM oven/bun:latest

# Copy package.json and bun.lockb to the container
COPY package.json bun.lockb* ./

# Install any dependencies
RUN bun install

# Copy the rest of your app's source code
COPY . .

# Your app binds to port 3005
EXPOSE 3005

# Run the Bun app
CMD ["bun", "run", "scoper.ts"]
