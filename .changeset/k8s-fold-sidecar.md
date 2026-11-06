---
'@bilbomd/worker': minor
---

AlphaFold and OpenFold jobs on the Kubernetes backend (Berkelium) now run their structure-prediction service as a sidecar in the job's own pod. ColabFold or OpenFold3 shares the pod's GPU, so no GPU sits idle between jobs. Configure the images with `K8S_COLABFOLD_IMAGE` and `K8S_OF3_IMAGE`; without them a job gets no sidecar. Sidecar resources, `/dev/shm` size and the subPath that holds the OpenFold3 weights are configurable too. If the sidecar's image fails to pull, or the sidecar runs out of memory, the job now reports that.
