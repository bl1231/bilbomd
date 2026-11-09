# Berkelium GPU availability probe

A temporary study: how often could BilboMD get one GPU of each type on
Berkelium? The cluster uses DRA, and our namespace can't read
`resourceclaims`/`resourceslices` or other namespaces' pods, so we can't count
free GPUs directly. Instead we ask the scheduler.

Every 15 minutes the `gpu-probe` CronJob (in `bilbomd`, running as the
dispatcher's `bilbomd` service account):

1. Creates one Job per GPU type (A40, A100, H100, H200, B300). Each claims a
   single GPU through a `gpu-probe-<class>` ResourceClaimTemplate and runs
   `nvidia-smi`.
2. Waits up to 180 s for the pod to be scheduled, then up to 180 s more for it
   to finish. It records the node, the time to schedule and the GPU that
   `nvidia-smi` reported, or the scheduler's reason if it stayed Pending.
   Then it deletes the Job. A scheduled probe holds its GPU for a few seconds.
3. Saves a copy of the public status page,
   <https://berkelium.scs.lbl.gov/cluster/>, as a cross-check. That page is a
   cached snapshot ("Refreshed …") and, as of 2026-11-09, lists only some of
   the nodes, so it is not the measurement itself.

Results go to `uploads/gpu-probe/` on the `bilbomd-data` volume:
`probes/<class>.jsonl` (one JSON line per probe) and
`status/<round>.html.gz`.

## Running it

```bash
cd infra/berkelium-gpu-probe
./deploy.sh up       # ConfigMap with probe.sh, claim templates, CronJob
./deploy.sh run      # one round now, without waiting for the schedule
./deploy.sh logs     # output of the latest round
./deploy.sh status   # CronJob, recent Jobs, samples collected so far
./deploy.sh fetch    # copy results to ./results (git-ignored)
./deploy.sh down     # remove every probe object; results stay on the volume
```

After editing `probe.sh`, run `./deploy.sh up` again to refresh the ConfigMap.

## Analysis

```bash
python3 analyze.py results/ --csv results/probes.csv
```

For each GPU type it prints the share of probes scheduled within the window,
the share scheduled immediately (≤ 15 s), the time to schedule, the longest run
of failed probes, availability by hour and weekday (Pacific time), the nodes
used, the most common Pending reasons, and how often the status page agreed
with the probe in the same round. `own_gpu_pods` in each record counts our own
BilboMD job pods holding a GPU at the time, so you can tell whether we were
competing with ourselves.

Tests: `python3 -m pytest infra/berkelium-gpu-probe/tests` (Python 3.9+; not
run in CI).

## Notes

- Single-GPU probes only: "available" means at least one GPU of that type was
  free, not how many.
- Every object is labelled `app.kubernetes.io/part-of=bilbomd-gpu-probe`.
  Probe Jobs also carry `activeDeadlineSeconds: 600` and
  `ttlSecondsAfterFinished: 300`, so they clean themselves up if a round dies.
- Let Science IT know while it runs (ticket INC-1026354): it briefly takes
  GPUs that other users are queueing for.
