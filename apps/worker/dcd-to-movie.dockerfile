FROM ubuntu:24.04 AS build

# Install Flatpak and virtual display tools
RUN apt-get update && \
    apt-get install -y flatpak wget xvfb dbus-x11 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the local ChimeraX Flatpak package
COPY chimerax/ChimeraX-1.10.1.flatpak /tmp/ChimeraX.flatpak

# Install Flatpak runtime and ChimeraX
RUN flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo && \
    flatpak install --system --noninteractive /tmp/ChimeraX.flatpak && \
    rm /tmp/ChimeraX.flatpak

# Create a wrapper script for ChimeraX that handles headless operation
RUN echo '#!/bin/bash' > /usr/local/bin/chimerax && \
    echo 'export DISPLAY=${DISPLAY:-:99}' >> /usr/local/bin/chimerax && \
    echo 'export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"' >> /usr/local/bin/chimerax && \
    echo 'if [ -z "$DISPLAY" ] || ! xset q &>/dev/null; then' >> /usr/local/bin/chimerax && \
    echo '    Xvfb :99 -screen 0 1024x768x24 &' >> /usr/local/bin/chimerax && \
    echo '    export DISPLAY=:99' >> /usr/local/bin/chimerax && \
    echo '    sleep 2' >> /usr/local/bin/chimerax && \
    echo 'fi' >> /usr/local/bin/chimerax && \
    echo 'flatpak run edu.ucsf.rbvi.ChimeraX "$@"' >> /usr/local/bin/chimerax && \
    chmod +x /usr/local/bin/chimerax

# Test the installation
# RUN chimerax --nogui --version || echo "ChimeraX installed successfully"