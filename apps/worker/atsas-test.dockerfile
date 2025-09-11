# -----------------------------------------------------------------------------
# Setup the base image
FROM ubuntu:22.04 AS build
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y qtcreator && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Install ATSAS
FROM build AS install-atsas
RUN apt-get update && \
    apt-get install -y libxcb-cursor0 libgfortran5 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp
COPY atsas/ATSAS-4.0.1-1-Linux-Ubuntu-22.run .
COPY atsas/atsas.lic .
RUN mkdir /root/.local && chmod +x ATSAS-4.0.1-1-Linux-Ubuntu-22.run && \
    ./ATSAS-4.0.1-1-Linux-Ubuntu-22.run --platform minimal --accept-licenses --auto-answer \
    AutomaticRuntimeDependencyResolution=Yes --root /usr/local/ATSAS-4.0.1 --file-query KeyFilePath=/tmp/atsas.lic \
    --confirm-command install && \
    rm ATSAS-4.0.1-1-Linux-Ubuntu-22.run
