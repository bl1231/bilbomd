# Notes

While editing `bilbomd-scoper.dockerfile` so that it would build on GitHub Action runners I switched from `pytorch/pytorch:latest` to `python:3.10-slim`. I have recorded the exact conda environment from both the version 1.1.2 (`pytorch/pytorch:latest` and built on hyperion) and version 1.2.0 (`python:3.10-slim` built via GitHub actions) for posterity. Of note, they do have the same versions of key packages

## 1.1 and earlier:

python 3.10.9
pyg 2.4.0
pytorch 2.1.2
imp 2.19.0

## 1.2 and later:

python 3.10.15
pyg 2.4.0
pytorch 2.1.2
imp 2.19.0

I tested a few of Michal's RNAs and get the exact same results with both the pre- and post-github actions workflow.
