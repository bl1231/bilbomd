# --------------------------------------------------------------------------------------
# BilboMD Worker Dockerfile
FROM ghcr.io/bl1231/bilbomd-worker-base:latest

# Install Node.js and update npm to latest
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get update && \
    apt-get install -y nodejs && \
    npm install -g npm@latest && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g ${GROUP_ID} bilbomd && \
    useradd -u ${USER_ID} -g ${GROUP_ID} -m -d /home/bilbo -s /bin/bash bilbo
WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
ARG GITHUB_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > /root/.npmrc
RUN npm ci --no-audit --no-fund
RUN rm /root/.npmrc

# Copy app source and build
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build:ci

# Set permissions
RUN chown -R bilbo:bilbomd /app

# Switch to non-root user
USER bilbo:bilbomd

# Runtime environment variables (if needed)
ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "start"]