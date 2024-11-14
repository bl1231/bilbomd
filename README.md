# bilbomd-scoper

## Description

This project will support the Scoper/IonNet pipeline. Scoper is a novel pipeline that uses a combination of classical algorithms and deep-learning techniques to find structures, along with magnesium ion binding sites that fit a given saxs profile, given an initial structure to work with. A novel deep neural network was created for this pipeline which we named IonNet. IonNet is used to predict magnesium binding sites for RNA structures.

## Python stuff

Just keeping track of the Python packages I'm installing in order to test the IonNet scripts.

on `hyperion`:

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

Trying to figure out how to invoke this monstrosity...

```bash
python IonNet/mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/MHtest2.pdb -ahs IonNet/scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/MHtest2.dat -it saxs -mp IonNet/models/trained_models/wandering-tree-178.pt -cp IonNet/models/trained_models/wandering-tree-178_config.npy -fs foxs -mfcs multi_foxs_combination -kk 1000 -tk 3 -mfs multi_foxs -mfr True
```

cd into `IonNet` then run this:

Michal's test files:

```bash
python /home/bun/IonNet/mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/MHtest2.pdb -ahs /home/bun/IonNet/scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/MHtest2.dat -it sax -mp /home/bun/IonNet/models/trained_models/wandering-tree-178.pt -cp /home/bun/IonNet/models/trained_models/wandering-tree-178_config.npy -fs foxs -mfcs multi_foxs_combination -kk 1000 -tk 1 -mfs multi_foxs -mfr True
```

Edan's test files:

```bash
python mgclassifierv2.py -bd /home/bun/app/test-data scoper -fp /home/bun/app/test-data/EdanSL2.pdb -ahs scripts/scoper_scripts/addHydrogensColab.pl -sp /home/bun/app/test-data/EdanSL2.dat -it sax -mp models/trained_models/wandering-tree-178.pt -cp models/trained_models/wandering-tree-178_config.npy -fs /opt/miniconda/bin/foxs -mfcs /home/bun/app/test-data/IonNet/scripts/scoper_scripts/multi_foxs_combination -kk 100 -tk 1 -mfs /opt/miniconda/bin/multi_foxs -mfr True
```

## Test KGSrna

in scoper_pipeline.py takes 4 positional args

self.**pdb_path,
self.**pdb_path,
self.**kgs_k,
self.**pdb_workdir

```bash
scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial {}.HB --hbondMethod rnaview --hbondFile {}.HB.out -s {} -r 20 -c 0.4 --workingDirectory {}/ > ! out "
```

This is core dumping. Apparently `KGSrna`` will only run on Intel and core dumps on AMD.

```bash
scripts/scoper_scripts/Software/Linux64/KGSrna/KGSrna --initial /home/bun/app/test-data/MHtest2.pdb.HB --hbondMethod rnaview --hbondFile /home/bun/app/test-data/MHtest2.pdb.HB.out -s 50 -r 20 -c 0.4 --workingDirectory /home/bun/app/test-data/KGSRNA/MHtest2.pdb.2/
```

Try `kgs_explore` using PDB output from `kgs_prepare.py` script.

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

- 1.2.0 (11/14/2024)
  - GitHub actions now builds docker image automatically
  - Docker image built on python:3.10-slim to reduce size
- 1.1.2 (11/13/2024)
  - Allow user to fix c1/c2 values used in the `multifoxs_combination` step
  - Update progress in top level Mongo Job entry
- 1.0.6
  - Peg `pyg` at version 2.4.0
  - Bump `nodejs` from 20.12.2 to 20.15.0
  - Use `bilbomd-mongodb-schema` library
  - Downgrade `IMP` from 2.20.1 to 2.19.0 for now
  - Added logging module & replaced some `console.log()` statements
  - Removed reference to `/home/bun`
  - Improve `Dockerfile`
  - Add a `config.ts` file
  - Started to reorganize the directory structure similar to `bilbomd-worker`
  - Copied `tsconfig.ts` from `bilbomd-worker`
- 1.0.5
  - Update dependencies.
- 1.0.4
  - Update dependencies.
  - Refactor the `Dockerfile`
- 1.0.3
  - Add a README file to each `results.tar.gz` file.
- 1.0.2
  - Update dependencies
- 1.0.1
  - add runtime params (`--min_c1=0.99 --max_c1=1.05 --min_c2=-0.5 --max_c2=2.0`) to `FoXS`
- 1.0.0
  - Add ability to run `FoXS` on results
  - Might as well make this verion 1.0.0 since it seems to work on our test RNAs
- 0.0.4
  - Add the `-u` flag for Python spawn of `mgclassifierv2.py`.
    This should allow the `scoper.log` file to present better incremental information.
- 0.0.3
  - Fix the Mg and HETATM spacing in final PDB file
- 0.0.1
  - Initial working version of Scoper/IonNet pipeline
