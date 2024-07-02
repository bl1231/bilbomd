# IonNet

Speed up docker build time by downloading source zip file into this directory.

```bash
curl -L -o docker-test.zip https://github.com/bl1231/IonNet/archive/refs/heads/docker-test.zip
```

Then adjust the `Dockerfile` by changing:

```dockerfile
# Clone and Build 'RNAview'
WORKDIR /home/scoper
RUN git clone git@github.com:bl1231/IonNet.git && \
RUN cd IonNet/scripts/scoper_scripts && \
    tar xvf KGSrna.tar
```

to:

```dockerfile
# Copy IonNet source code
WORKDIR /home/scoper
COPY ionnet/docker-test.zip .
RUN unzip docker-test.zip && \
    mv IonNet-docker-test IonNet && \
    cd IonNet/scripts/scoper_scripts && \
    tar xvf KGSrna.tar
```
