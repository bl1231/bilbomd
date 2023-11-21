# Build stage 1
FROM nvidia/cuda:12.1.0-devel-ubuntu20.04 as build-stage-1
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/London
RUN apt-get update && apt-get install -y build-essential git cmake libgsl-dev sed

# Clone and build 'KGS'
WORKDIR /usr/local/src/
RUN git clone https://github.com/ExcitedStates/KGS.git
WORKDIR /usr/local/src/KGS
RUN sed -i 's/option(ForceGSL "ForceGSL" OFF)/option(ForceGSL "ForceGSL" ON)/' src/CMakeLists.txt
WORKDIR /usr/local/src/KGS/build
RUN cmake -DCMAKE_BUILD_TYPE=Release ../src
RUN make -j
RUN rm -rf /var/lib/apt/lists/*