FROM ubuntu:22.04 AS builder

RUN apt-get update && \
    apt-get install -y libx11-dev libtiff5-dev libxkbcommon-x11-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Install ATSAS
FROM builder AS install-atsas
# RUN apt-get update && \
#     apt-get install -y shared-mime-info libxkbcommon-x11-0 libxcb-cursor0 libxcb-icccm4 \
#     libxcb-keysyms1 libxcb-shape0 libc6 libgcc1 libstdc++6 libxml2 libtiff5 liblzma5 libgfortran5 libicu70 libharfbuzz0b && \
#     apt-get clean && rm -rf /var/lib/apt/lists/*
# RUN apt-get update && \
#     apt-get install -y shared-mime-info libxkbcommon-x11-0 libxcb-cursor0 libxcb-icccm4 \
#     libxcb-keysyms1 libxcb-shape0 libc6 libgcc1 libstdc++6 libxml2 libtiff5 liblzma5 libgfortran5 libicu70 libharfbuzz0b && \
#     apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp
COPY atsas/ATSAS-4.0.1-1-Linux-Ubuntu-22.run .
COPY atsas/atsas.lic .
RUN mkdir /root/.local && chmod +x ATSAS-4.0.1-1-Linux-Ubuntu-22.run && \
    ./ATSAS-4.0.1-1-Linux-Ubuntu-22.run --accept-licenses --auto-answer \
    AutomaticRuntimeDependencyResolution=Yes --root /usr/local/ATSAS-4.0.1 --file-query KeyFilePath=/tmp/atsas.lic \
    --platform minimal  --confirm-command install && \
    rm ATSAS-4.0.1-1-Linux-Ubuntu-22.run