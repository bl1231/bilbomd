# msa-service

Self-hosted ColabFold MSA server: [MMseqs2-App]'s `mmseqs-server` in `-local`
mode (HTTP server and one worker in one process), speaking the same API as
`https://api.colabfold.com`. It replaces the public server for BilboMD's
AlphaFold (`colabfold-service`), OpenFold3 and BioEmu2 pipelines (issue #1199).

Clients point at it by URL, e.g. `colabfold_batch --host-url=http://msa-service:8080`
(set `COLABFOLD_HOST_URL` on `colabfold-service`).

[MMseqs2-App]: https://github.com/soedinglab/MMseqs2-App

## Pinned versions

| Component       | Commit                                     | Note                                                                           |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `mmseqs`        | `e42b1426534e1aefe442822b70e8f0a956a672d9` | Built from source with CUDA. Must match the mmseqs that built the `.idx` files |
| `mmseqs-server` | `01365aa4735539ba95b417f73fb5326c77410394` | Default in ColabFold's `MsaServer/setup-and-start-local.sh`                    |

Change them with the `MMSEQS_COMMIT` / `MMSEQS_SERVER_COMMIT` build args in the
`Dockerfile`. Bumping `MMSEQS_COMMIT` means rebuilding the `.idx` files with the
same commit (see below).

## Runtime

| Env                 | Default | Meaning                                                                                                    |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `MSA_GPU`           | `1`     | Run the searches on the GPU                                                                                |
| `MSA_GPU_SERVER`    | `0`     | Keep a resident `mmseqs gpuserver`. Saves ~1.5 s per request but pins the padded DBs (~250 GB) in host RAM |
| `MSA_WORKERS`       | `1`     | Concurrent MSA jobs                                                                                        |
| `MSA_JOBS_TTL_DAYS` | `2`     | Job dirs under `/jobs` older than this are deleted (the server never cleans up itself)                     |

Mounts: the database directory read-only at `/databases`, and a writable
scratch/results dir at `/jobs` (owned by the container UID/GID).

Health: `GET /queue` returns `{"queued": N}`.

The entrypoint refuses to start unless the database build finished: it checks
the `*_READY` markers below and the three `.idx` files.

## Database (epyc: `/af2_data/mmseqs-databases`)

Built with ColabFold's `setup_databases.sh` (GPU / prebuilt variant) from the
tarballs kept in the same directory. Contents and markers:

| Database                     | Built from                                                  | Marker            |
| ---------------------------- | ----------------------------------------------------------- | ----------------- |
| `uniref30_2302_db*`          | `uniref30_2302.tar.gz` + `uniref30_2302_newtaxonomy.tar.gz` | `UNIREF30_READY`  |
| `colabfold_envdb_202108_db*` | `colabfold_envdb_202108.tar.gz`                             | `COLABDB_READY`   |
| `pdb100_230517`              | `pdb100_230517.fasta.gz` (`createdb` + `makepaddedseqdb`)   | `PDB_READY`       |
| `pdb100_a3m.ff{data,index}`  | `pdb100_foldseek_230517.tar.gz`                             | `PDB100_READY`    |
| `pdb/{divided,obsolete}`     | PDB mmCIF rsync (templates)                                 | `PDB_MMCIF_READY` |
| `*.idx` (all three DBs)      | `mmseqs createindex`                                        | `IDX_READY`       |

`IDX_READY` is ours, not ColabFold's. Every step after the search in the server's
MSA script reads `<db>.idx`, so the indexes are required even for GPU search.
GPU-only slim indexes (no k-mer table, no sequence lookup):

```bash
cd /af2_data/mmseqs-databases
export MMSEQS_FORCE_MERGE=1
for db in uniref30_2302_db colabfold_envdb_202108_db pdb100_230517; do
  nice -n 19 ionice -c3 mmseqs createindex "$db" "tmp_idx_$db" \
    --remove-tmp-files 1 --split 1 --index-subset 10 --threads 32
done
touch IDX_READY
```

### Rebuilding from the tarballs

Nothing needs downloading. Run each step from `setup_databases.sh`
(ColabFold checkout on epyc: `~/projects/ColabFold`) whose marker is missing,
under `nice -n 19 ionice -c3` on the prod host:

1. Extract the tarball (`pigz -dc X.tar.gz | tar -xvf -`). The tarballs are the
   prebuilt CPU+GPU format (members are `*_db*`), so `tsv2exprofiledb` is
   not needed.
2. `touch` the marker only after the step succeeds. An interrupted extract
   leaves a half-written `*_db_seq` with no `.index`/`.dbtype`. That is the
   state the April 2026 run was left in.
3. Rebuild the `.idx` files (above).

Expect several hours. It's mostly I/O on the SATA SSD.

### When to update

Only when ColabFold moves the public server to new database releases (see the
[database history]) and we want parity. New releases mean new tarballs, a full
rebuild and a re-validation against the public server.

[database history]: https://github.com/sokrypton/ColabFold/wiki/MSA-Server-Database-History

### Disk

`/af2_data` is a 7 TB SATA SSD, ~84% full (Nov 2026). The built databases are
~770 GB plus ~255 GB of tarballs. The slim indexes add a few hundred GB more.
Delete the tarballs only if you're willing to re-download (~255 GB) for any rebuild.
