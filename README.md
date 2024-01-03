# bilbomd-scoper

## Description

This project will support the Scoper pipeline.

## Python stuff

Just keeping track of teh Python packages I'm installing in order to test the IonNet scripts

on `hyperion`

```bash
(py310-ionnet) [17:18]classen@hyperion:~/projects/IonNet$python mgclassifierv2.py
usage: mgclassifierv2.py [-h] -bd BASE_DIR [-kfp KFOLD_PATH] {preprocess,split-samples,train,test,inference,scoper,kfold} ...
mgclassifierv2.py: error: the following arguments are required: -bd/--base-dir, action
```

These are the `pip install` commands present in Ben's notebook:

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

cd into `IonNet` then run this:

Michal's test files:

```
python /home/bun/IonNet/mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/MHtest2.pdb -ahs /home/bun/IonNet/scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/MHtest2.dat -it sax -mp /home/bun/IonNet/models/trained_models/wandering-tree-178.pt -cp /home/bun/IonNet/models/trained_models/wandering-tree-178_config.npy -fs foxs -mfcs multi_foxs_combination -kk 1000 -tk 1 -mfs multi_foxs -mfr True
```

Edan's test files:

```
python mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/EdanSL2.pdb -ahs scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/EdanSL2.dat -it sax -mp models/trained_models/wandering-tree-178.pt -cp models/trained_models/wandering-tree-178_config.npy -fs /opt/miniconda/bin/foxs -mfcs /home/bun/app/test-data/IonNet/scripts/scoper_scripts/multi_foxs_combination -kk 100 -tk 1 -mfs /opt/miniconda/bin/multi_foxs -mfr True
```

## Test KGSrna

in scoper_pipeline.py takes 4 positional args

self.**pdb_path,
self.**pdb_path,
self.**kgs_k,
self.**pdb_workdir

```
scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial {}.HB --hbondMethod rnaview --hbondFile {}.HB.out -s {} -r 20 -c 0.4 --workingDirectory {}/ > ! out "

```

This is core dumping. Apparently KGSrna will only run on Intel and core dumps on AMD.

```bash
scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial /home/bun/app/test-data/MHtest2.pdb.HB --hbondMethod rnaview --hbondFile /home/bun/app/test-data/MHtest2.pdb.HB.out -s 50 -r 20 -c 0.4 --workingDirectory /home/bun/app/test-data/KGSRNA/MHtest2.pdb.2/

```

scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial /home/bun/app/test-data/EdanSL2.pdb.HB --hbondMethod rnaview --hbondFile /home/bun/app/test-data/EdanSL2.pdb.HB.out -s 50 -r 20 -c 0.4 --workingDirectory /home/bun/app/test-data/KGSRNA/EdanSL2.pdb

Try kgs_explore using PDB output from `kgs_prepare.py` script.

```bash
kgs_explore  --initial /home/bun/app/test-data/MHtest2.pdb.kgs.pdb -s 100 -r 20 -c 0.4 --workingDirectory /home/bun/app/test-data/KGSRNA/MHtest2.pdb/
```

## Docker stuff

### build Docker container

```bash
docker build -t bilbomd-scoper .
```

Or maybe just build up to a specific stage:

```bash
docker build --target build-stage-1 -t bilbomd-scoper-stage-1 .
```

### Run Docker container with pwd mounted into container

These are a few iterations of `docker run` commands I have usde during development.

```bash
docker run -d -p 3005:3005 -v .:/home/bun/app --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 --gpus all -v .:/home/bun/app --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 --gpus all -v .:/home/bun/app -v /home/classen/projects/IonNet:/home/bun/app/test-data/IonNet --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 -v .:/home/bun/app -v /home/classen/projects/IonNet:/home/bun/IonNet --name bilbomd-scoper bilbomd-scoper
```

As it turns out the `KGSrna` binary distributed with `IonNet` only runs on Intel processors, and attempting to run on `epyc.bl1231.als.lbl.gov` (with an AMD epyc processor) resulted on core dumping.

### Run daemonized Docker container with internal app directory

```bash
docker run -d -p 3005:3005 --gpus all --name bilbomd-scoper bilbomd-scoper
docker run -d -p 3005:3005 --name bilbomd-scoper bilbomd-scoper
```

### Launch an interactive Docker container terminal

```bash
docker exec -it bilbomd-scoper bash
```

### Stop and Remove Docker container

```bash
docker stop bilbomd-scoper
docker rm bilbomd-scoper
```

## Version History

- 0.0.1
  - Initial working version of Scoper/IonNet pipeline
