# RNAView

Speed up docker build time by downloading source zip file into this directory.

```bash
curl -L -o rnaview.zip https://github.com/rcsb/RNAView/archive/refs/heads/master.zip
```

Then adjust the `Dockerfile` by changing:

```dockerfile
# Clone and Build 'RNAview'
WORKDIR /usr/local
RUN git clone https://github.com/rcsb/RNAView.git RNAView && \
RUN cd RNAView && \
    make
```

to:

```dockerfile
# Copy and Build 'RNAview'
WORKDIR /usr/local
COPY rnaview/rnaview.zip .
RUN unzip rnaview.zip && \
    mv RNAView-master RNAView && \
    cd RNAView && \
    make
```
