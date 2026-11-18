// bioemu2-service runs only beside a local worker (docker compose). The NERSC
// and Kubernetes execution backends have no executor for this pipeline yet
// (bilbomd#1200 phase 2), so a deployment on either must not accept BioEmu2
// jobs, even with ENABLE_BILBOMD_BIOEMU set: they would fail in the worker.

const isTrue = (value?: string): boolean =>
  value === 'true' || value === '1' || value?.toLowerCase() === 'yes'

// The worker's execution backend ('local', 'nersc' or 'k8s'). Mirrors the
// worker's choice: EXECUTION_BACKEND wins, then USE_NERSC.
const executionBackend = (): string => {
  const explicit = process.env.EXECUTION_BACKEND?.trim().toLowerCase()
  if (explicit) return explicit
  return isTrue(process.env.USE_NERSC) ? 'nersc' : 'local'
}

// The execution backend that rules BioEmu2 out here, or null if it can run.
const bioemuUnsupportedBackend = (): string | null => {
  const backend = executionBackend()
  return backend === 'local' ? null : backend
}

const bioemuEnabled = (): boolean =>
  process.env.ENABLE_BILBOMD_BIOEMU === 'true' &&
  bioemuUnsupportedBackend() === null

export { executionBackend, bioemuUnsupportedBackend, bioemuEnabled }
