// bioemu2-service runs only beside a local worker (docker compose). The NERSC
// and Kubernetes execution backends have no executor for this pipeline yet
// (bilbomd#1200 phase 2), so a deployment on either must not accept BioEmu2
// jobs, even with ENABLE_BILBOMD_BIOEMU set: they would fail in the worker.

const isTrue = (value?: string): boolean =>
  value === 'true' || value === '1' || value?.toLowerCase() === 'yes'

// The execution backend that rules BioEmu2 out here, or null if it can run.
// Mirrors the worker's choice: EXECUTION_BACKEND wins, then USE_NERSC.
const bioemuUnsupportedBackend = (): string | null => {
  const explicit = process.env.EXECUTION_BACKEND?.trim().toLowerCase()
  if (explicit) return explicit === 'local' ? null : explicit
  return isTrue(process.env.USE_NERSC) ? 'nersc' : null
}

const bioemuEnabled = (): boolean =>
  process.env.ENABLE_BILBOMD_BIOEMU === 'true' &&
  bioemuUnsupportedBackend() === null

export { bioemuUnsupportedBackend, bioemuEnabled }
