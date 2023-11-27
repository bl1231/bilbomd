# bilbomd-scoper

## Description

This project will support the Scoper pipeline.

## Python stuff

Just keeping track of teh Python packages I'm installing in order to test the IonNet scripts

on `hyperion`

```bash
conda create --name py310-ionnet python=3.10
conda activate py310-ionnet

conda install numpy
conda install matplotlib

conda search torch_geometric
conda install pytorch
conda install scipy
conda install torch_geometric
conda install pyg -c pyg
pip install wandb
conda install pandas
conda install biopython
conda install seaborn
conda install h5py
conda install torchmetrics

```

```bash
(py310-ionnet) [17:18]classen@hyperion:~/projects/IonNet$python mgclassifierv2.py
usage: mgclassifierv2.py [-h] -bd BASE_DIR [-kfp KFOLD_PATH] {preprocess,split-samples,train,test,inference,scoper,kfold} ...
mgclassifierv2.py: error: the following arguments are required: -bd/--base-dir, action
```

These are teh `pip install` commands present in Ben's notebook:

```bash
pip install torch==1.13.1+cu116 -f https://download.pytorch.org/whl/torch_stable.html
pip install torch-scatter     -f https://pytorch-geometric.com/whl/torch-{TORCH}+{CUDA}.html
pip install torch-sparse      -f https://pytorch-geometric.com/whl/torch-{TORCH}+{CUDA}.html
pip install torch-cluster     -f https://pytorch-geometric.com/whl/torch-{TORCH}+{CUDA}.html
pip install torch-spline-conv -f https://pytorch-geometric.com/whl/torch-{TORCH}+{CUDA}.html
pip install torch-geometric==2.2.0
pip install wandb
pip install torchmetrics==0.7.2
```

## Scoper stuff

Trying to figure out how to invoke this monstrosity.

```
python IonNet/mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/MHtest2.pdb -ahs IonNet/scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/MHtest2.dat -it saxs -mp IonNet/models/trained_models/wandering-tree-178.pt -cp IonNet/models/trained_models/wandering-tree-178_config.npy -fs foxs -mfcs multi_foxs_combination -kk 1000 -tk 3 -mfs multi_foxs -mfr True
```

```
python mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/MHtest2.pdb -ahs scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/MHtest2.dat -it saxs -mp models/trained_models/wandering-tree-178.pt -cp models/trained_models/wandering-tree-178_config.npy -fs foxs -mfcs multi_foxs_combination -kk 1000 -tk 3 -mfs multi_foxs -mfr True
```

Test KGSrna

in scoper_pipeline.py takes 4 positional args

self.**pdb_path,
self.**pdb_path,
self.**kgs_k,
self.**pdb_workdir

```
scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial {}.HB --hbondMethod rnaview --hbondFile {}.HB.out -s {} -r 20 -c 0.4 --workingDirectory {}/ > ! out "

```

```
scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial /home/bun/app/test-data/MHtest2.pdb.HB --hbondMethod rnaview --hbondFile /home/bun/app/test-data/MHtest2.pdb.HB.out -s 1000 -r 20 -c 0.4 --workingDirectory /home/bun/app/test-data/KGSRNA/MHtest2.pdb/

```

## Docker stuff

### build Docker container

docker build -t bilbomd-scoper .

docker build --target build-stage-1 -t bilbomd-scoper-stage-1 .

### Run Docker container with pwd mounted into container

docker run -d -p 3005:3005 --gpus all -v .:/home/bun/app --name bilbomd-scoper bilbomd-scoper

### Run Docker container with internal app dir

docker run -d -p 3005:3005 --gpus all --name bilbomd-scoper bilbomd-scoper

docker run -it bilbomd-scoper-stage-1 bash

### Launch an interactive Docker container terminal

docker exec -it bilbomd-scoper bash

### Stop and Remove Docker container

docker stop bilbomd-scoper
docker rm bilbomd-scoper

## BunJS stuff

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.0.12. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
