# Self-hosted ColabFold MSA server (MMseqs2-App's mmseqs-server in -local
# mode), a drop-in for https://api.colabfold.com. See README.md.
#
# MMSEQS_COMMIT must match the mmseqs that built the database .idx files on
# the host (/af2_data/mmseqs-databases on epyc), or the server may not be
# able to read them. No prebuilt GPU archive exists for this commit, so it
# is compiled from source.
ARG CUDA_VERSION=12.9.1
ARG MMSEQS_COMMIT=e42b1426534e1aefe442822b70e8f0a956a672d9
ARG MMSEQS_SERVER_COMMIT=01365aa4735539ba95b417f73fb5326c77410394

# ------------------------------------------------------------------------------
FROM nvidia/cuda:${CUDA_VERSION}-devel-ubuntu24.04 AS mmseqs-build
ARG MMSEQS_COMMIT

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates git cmake ninja-build g++ cargo rustc zlib1g-dev libbz2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/build
RUN git init -q MMseqs2 \
    && git -C MMseqs2 fetch -q --depth 1 https://github.com/soedinglab/MMseqs2.git "${MMSEQS_COMMIT}" \
    && git -C MMseqs2 checkout -q FETCH_HEAD

# sm_80 = A100 (epyc), sm_86 = A40 (Berkelium), sm_89/sm_90 for newer cards.
RUN cmake -S MMseqs2 -B build -GNinja \
        -DCMAKE_BUILD_TYPE=Release \
        -DHAVE_AVX2=1 \
        -DHAVE_TESTS=0 \
        -DENABLE_CUDA=1 \
        -DCMAKE_CUDA_ARCHITECTURES="80-real;86-real;89-real;90" \
    && cmake --build build -j"$(nproc)" \
    && install -m 0755 build/src/mmseqs /opt/mmseqs

# ------------------------------------------------------------------------------
FROM golang:1.25-bookworm AS server-build
ARG MMSEQS_SERVER_COMMIT

WORKDIR /opt/build
RUN git init -q MMseqs2-App \
    && git -C MMseqs2-App fetch -q --depth 1 https://github.com/soedinglab/MMseqs2-App.git "${MMSEQS_SERVER_COMMIT}" \
    && git -C MMseqs2-App checkout -q FETCH_HEAD
RUN cd MMseqs2-App/backend \
    && CGO_ENABLED=0 go build -trimpath -o /opt/mmseqs-server

# ------------------------------------------------------------------------------
FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu24.04
ARG MMSEQS_COMMIT
ARG MMSEQS_SERVER_COMMIT

# gawk: the server's MSA shell script uses awk. curl: healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gawk libatomic1 libgomp1 zlib1g libbz2-1.0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mmseqs-build /opt/mmseqs /usr/local/bin/mmseqs
COPY --from=server-build /opt/mmseqs-server /usr/local/bin/mmseqs-server
COPY config.json /app/config.json
COPY entrypoint.sh /app/entrypoint.sh

ENV MMSEQS_COMMIT=${MMSEQS_COMMIT} \
    MMSEQS_SERVER_COMMIT=${MMSEQS_SERVER_COMMIT} \
    MSA_DB_DIR=/databases \
    MSA_JOBS_DIR=/jobs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8080/queue || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
