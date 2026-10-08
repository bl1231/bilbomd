# FoXS GPU benchmark (issue #1157)

Side-by-side comparison of the FoXS shipped with IMP (`/usr/bin/foxs`, what the
worker uses today) and the standalone [dina-lab3D/foxs](https://github.com/dina-lab3D/foxs)
rewrite, built both CPU-only (`foxs-cpu`) and with CUDA (`foxs-gpu --gpu`).

Nothing here is wired into the worker. It is a test harness only.

## Files

| File                    | Purpose                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `foxs-bench.dockerfile` | Builds both standalone variants at a pinned commit on top of the worker image (which has IMP `foxs` + `multi_foxs`) |
| `bench.py`              | Re-runs the FoXS step of a finished BilboMD job with every binary/mode, then compares outputs                       |
| `scaling.py`            | Synthetic N-copy assemblies of one model to show how each binary scales with atom count                             |
| `run-epyc.sh`           | Driver for epyc: GPU 0 (dev) only, dev MPS daemon, scratch on `/scr/foxs-bench`                                     |

## What `bench.py` measures

Input is a finished job dir (mounted read only). Models under `foxs/*/*.pdb`
are copied to scratch, then each mode writes its own `runs/<mode>/foxs/` tree.

Timing modes (all produce `<model>.pdb.dat` partial profiles via `-p`):

| Mode                   | What it is                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `imp-cpu-perfile`      | **Reference.** Exactly what the worker does now: one `foxs -p model.pdb` per model, 18 at a time |
| `new-cpu-perfile`      | Same pattern, standalone CPU build. Drop-in binary swap                                          |
| `imp-cpu-batch`        | 18 processes, each given ~1/18 of the models in one call                                         |
| `new-cpu-batch`        | Same, standalone CPU build                                                                       |
| `new-gpu-perfile`      | One `foxs-gpu --gpu -p model.pdb` per model, 18 at a time. Drop-in swap + flag                   |
| `new-gpu-perfile-mps`  | Same, through the CUDA MPS daemon (how prod runs GPU work)                                       |
| `new-gpu-batch-xN`     | N processes on one GPU, each handed 1/N of all models in a single call                           |
| `new-gpu-batch-xN-mps` | Largest N, through MPS                                                                           |

Accuracy checks, all against `imp-cpu-perfile`:

1. **Profiles**: every column of every `.pdb.dat`, error normalised by that
   column's max |value|.
2. **Single-model fits**: `foxs model.pdb exp.dat` on a sample of models with
   each tool. Compares chi², c1, c2, rank correlation, top-10 overlap.
3. **multi_foxs**: IMP `multi_foxs -o exp.dat foxs_dat_files.txt` (same call as
   the worker) on each tool's profiles. Compares best-ensemble chi² and
   membership per ensemble size. This is the result users actually see.

Output is `results.json` per dataset.

## Running on epyc

```bash
# from a checkout of this dir on epyc
docker build -f foxs-bench.dockerfile -t bilbomd-foxs-bench:local .
./run-epyc.sh full <job-uuid>:small <job-uuid>:large      # results in /scr/foxs-bench/full/<label>/
EXTRA_ARGS="--max-models 60 --skip-multifoxs" ./run-epyc.sh smoke <job-uuid>   # quick check

# atom-count scaling
docker run --rm --gpus device=0 --user "$(id -u):$(id -g)" \
  -v /bilbomd/dev/uploads/<job>:/job:ro -v /scr/foxs-bench:/out bilbomd-foxs-bench:local \
  python3 /opt/foxs-bench/scaling.py --pdb /job/foxs/<rundir>/<model>.pdb --out /out/scaling
```

GPU 0 is dev's GPU. Prod workers and the prod MPS daemon are pinned to GPU 1,
so benchmarks on GPU 0 do not contend with prod GPU work. They do share CPUs.
