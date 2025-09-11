# SANS scripts

To build `bilbomd-sans` Docker image on an M3 Mac invoke one of the following commands.

```bash
docker buildx build --platform linux/amd64 -t bilbomd/bilbomd-sans:0.0.1 -f bilbomd-sans.dockerfile .
docker buildx build --platform linux/amd64 -t bilbomd/bilbomd-sans:latest -f bilbomd-sans.dockerfile .
docker buildx build --platform linux/amd64 -t bilbomd/bilbomd-sans -f bilbomd-sans.dockerfile .
```
