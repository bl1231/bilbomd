#!/usr/bin/env bash
# One round of the Berkelium GPU availability study (run by the gpu-probe
# CronJob, see README.md).
#
# For each GPU type it creates a one-GPU Job and waits up to PROBE_WAIT_SECONDS
# for the scheduler to place it. The answer to "could BilboMD have had a GPU of
# this type right now?" is whether the pod was scheduled in that window. Each
# attempt is appended as one JSON line to $DATA_DIR/probes/<class>.jsonl. The
# live per-node GPU counts behind https://berkelium.scs.lbl.gov/cluster/ go to
# $DATA_DIR/status/<round>.json.gz.
set -uo pipefail

GPU_CLASSES=${GPU_CLASSES:-"a40 a100 h100 h200 b300"}
PROBE_WAIT_SECONDS=${PROBE_WAIT_SECONDS:-180}
# How long a scheduled probe may take to pull its image and run nvidia-smi
RUN_WAIT_SECONDS=${RUN_WAIT_SECONDS:-180}
POLL_SECONDS=${POLL_SECONDS:-5}
PROBE_IMAGE=${PROBE_IMAGE:?PROBE_IMAGE is required}
DATA_DIR=${DATA_DIR:-/data}
# The API the status page polls (Connect RPC, no login needed). The page's own
# HTML is a stale build-time snapshot, so we record this instead.
STATUS_API=${STATUS_API:-https://berkelium.scs.lbl.gov/berkelium.v1.PortalService/GetClusterInfo}
NAMESPACE=${NAMESPACE:-$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)}
RUN_AS_USER=${RUN_AS_USER:-62704}
RUN_AS_GROUP=${RUN_AS_GROUP:-1001}
LABEL_KEY=app.kubernetes.io/part-of
LABEL_VALUE=bilbomd-gpu-probe

ROUND=$(date -u +%Y%m%dT%H%M%SZ)
ROUND_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$DATA_DIR/probes" "$DATA_DIR/status"

k() { kubectl -n "$NAMESPACE" "$@"; }

log() { echo "$(date -u +%H:%M:%S) $*" >&2; }

# Number of real BilboMD job pods holding (or waiting for) a GPU claim, so the
# analysis can tell when we were competing with ourselves.
count_own_gpu_pods() {
  k get pods -o json 2>/dev/null | jq --arg k "$LABEL_KEY" --arg v "$LABEL_VALUE" '
    [.items[]
     | select((.metadata.labels[$k] // "") != $v)
     | select((.spec.resourceClaims // []) | length > 0)
     | select(.status.phase == "Running" or .status.phase == "Pending")]
    | length' 2>/dev/null || echo null
}

job_manifest() {
  local name=$1 cls=$2
  cat <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: $name
  labels:
    $LABEL_KEY: $LABEL_VALUE
    bilbomd.lbl.gov/gpu-class: $cls
spec:
  backoffLimit: 0
  # Backstops in case this script dies before it deletes the Job
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 300
  template:
    metadata:
      labels:
        $LABEL_KEY: $LABEL_VALUE
        bilbomd.lbl.gov/gpu-class: $cls
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 5
      securityContext:
        runAsNonRoot: true
        runAsUser: $RUN_AS_USER
        runAsGroup: $RUN_AS_GROUP
        seccompProfile:
          type: RuntimeDefault
      resourceClaims:
        - name: gpu
          resourceClaimTemplateName: gpu-probe-$cls
      containers:
        - name: probe
          image: $PROBE_IMAGE
          imagePullPolicy: IfNotPresent
          command: ["sh", "-c"]
          args:
            - nvidia-smi --query-gpu=name,uuid,driver_version --format=csv,noheader || ls /dev/nvidia*
          resources:
            requests: { cpu: 100m, memory: 64Mi }
            limits: { cpu: 500m, memory: 256Mi }
            claims:
              - name: gpu
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
EOF
}

# Prints the pod JSON for a Job, or nothing if the pod doesn't exist yet
pod_json() {
  k get pods -l "job-name=$1" -o json 2>/dev/null | jq -c '.items[0] // empty'
}

probe() {
  local cls=$1
  local name="gpu-probe-$cls-$(echo "$ROUND" | tr 'A-Z' 'a-z')"
  local own_pods created_ok=true scheduled=false waited=0 pod="" error=""
  local node="" sched_seconds=null phase="" reason="" message="" gpu_info=""

  own_pods=$(count_own_gpu_pods)

  if ! job_manifest "$name" "$cls" | k create -f - >/dev/null 2>"/tmp/$name.err"; then
    created_ok=false
    error=$(head -c 500 "/tmp/$name.err")
  fi

  if $created_ok; then
    while [ "$waited" -lt "$PROBE_WAIT_SECONDS" ]; do
      pod=$(pod_json "$name")
      if [ -n "$pod" ] && [ "$(echo "$pod" | jq -r '.spec.nodeName // empty')" != "" ]; then
        scheduled=true
        break
      fi
      sleep "$POLL_SECONDS"
      waited=$((waited + POLL_SECONDS))
    done
    [ -z "$pod" ] && pod=$(pod_json "$name")

    if $scheduled; then
      # Let it run nvidia-smi so we know the GPU actually worked
      local ran=0
      while [ "$ran" -lt "$RUN_WAIT_SECONDS" ]; do
        phase=$(pod_json "$name" | jq -r '.status.phase // empty')
        case $phase in Succeeded | Failed) break ;; esac
        sleep "$POLL_SECONDS"
        ran=$((ran + POLL_SECONDS))
      done
      pod=$(pod_json "$name")
      gpu_info=$(k logs "job/$name" --tail=5 2>/dev/null | head -c 500)
    fi

    if [ -n "$pod" ]; then
      node=$(echo "$pod" | jq -r '.spec.nodeName // empty')
      phase=$(echo "$pod" | jq -r '.status.phase // empty')
      reason=$(echo "$pod" | jq -r '[.status.conditions[]? | select(.type == "PodScheduled")][0].reason // empty')
      message=$(echo "$pod" | jq -r '[.status.conditions[]? | select(.type == "PodScheduled")][0].message // empty' | head -c 500)
      if $scheduled; then
        sched_seconds=$(echo "$pod" | jq '
          ([.status.conditions[]? | select(.type == "PodScheduled" and .status == "True")][0].lastTransitionTime) as $t
          | if $t then (($t | fromdateiso8601) - (.metadata.creationTimestamp | fromdateiso8601)) else null end')
      fi
    fi

    k delete job "$name" --cascade=background --wait=false >/dev/null 2>&1 || true
  fi
  rm -f "/tmp/$name.err"

  jq -cn \
    --arg ts "$ROUND_ISO" --arg cls "$cls" --arg job "$name" \
    --argjson created "$created_ok" --argjson scheduled "$scheduled" \
    --argjson sched_seconds "$sched_seconds" --argjson wait "$PROBE_WAIT_SECONDS" \
    --arg node "$node" --arg phase "$phase" --arg reason "$reason" \
    --arg message "$message" --arg gpu "$gpu_info" --arg error "$error" \
    --argjson own "$own_pods" \
    'def nz: if . == "" then null else . end;
     {ts: $ts, class: $cls, job: $job, created: $created, scheduled: $scheduled,
      seconds_to_schedule: $sched_seconds, wait_seconds: $wait,
      node: ($node | nz), phase: ($phase | nz), reason: ($reason | nz),
      message: ($message | nz), gpu: ($gpu | nz), error: ($error | nz),
      own_gpu_pods: $own}' >>"$DATA_DIR/probes/$cls.jsonl"

  log "$cls: scheduled=$scheduled node=${node:--} t=${sched_seconds} ${reason}"
}

scrape_status() {
  local out="$DATA_DIR/status/$ROUND.json"
  if curl -fsS --max-time 60 -X POST \
    -H 'Content-Type: application/json' -H 'Connect-Protocol-Version: 1' \
    -d '{}' -o "$out" "$STATUS_API" && jq -e '.nodes | length > 0' "$out" >/dev/null; then
    gzip -f "$out"
    log "cluster info saved"
  else
    rm -f "$out"
    log "cluster info fetch failed"
  fi
}

scrape_status &
for cls in $GPU_CLASSES; do
  probe "$cls" &
done
wait
log "round $ROUND done"
