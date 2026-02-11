/**
 * Worker configuration constants
 *
 * This file centralizes all magic numbers and hardcoded values used throughout
 * the worker application to improve maintainability and configuration flexibility.
 */

// Worker concurrency settings
export const WORKER_CONCURRENCY = {
  NERSC: 50,
  LOCAL: 1,
  MOVIE: 1,
  MULTI_MD: 1
} as const

// BullMQ lock settings (in milliseconds)
export const LOCK_SETTINGS = {
  DURATION: 60_000, // 1 minute
  RENEW_TIME: 30_000 // 30 seconds
} as const

// Polling and monitoring intervals (in milliseconds)
export const INTERVALS = {
  TOKEN_CHECK: 300_000, // 5 minutes
  JOB_MONITORING: 60_000, // 1 minute
  NERSC_TASK_POLL: 2_000, // 2 seconds
  NERSC_JOB_POLL: 60_000 // 1 minute
} as const

// NERSC API retry configuration
export const NERSC_RETRY = {
  MAX_ATTEMPTS: 11,
  MAX_JOB_RETRIES: 10,
  MAX_ITERATIONS: 1_440, // 1440 x 60s = 24 hours
  RETRY_DELAY: 60_000 // 1 minute
} as const

// Progress calculation constants
export const PROGRESS = {
  MIN: 20, // Minimum progress percentage
  MAX: 90, // Maximum progress percentage
  SCALE_FACTOR: 70 // Scale factor for progress calculation (20% to 90%)
} as const

// Step weights for progress calculation
export const STEP_WEIGHTS: Record<string, number> = {
  alphafold: 20,
  pdb2crd: 5,
  pae: 5,
  autorg: 5,
  minimize: 10,
  initfoxs: 5,
  heat: 10,
  md: 30,
  dcd2pdb: 10,
  foxs: 10,
  multifoxs: 10,
  copy_results_to_cfs: 5,
  results: 3,
  email: 1,
  nersc_prepare_slurm_batch: 5,
  nersc_submit_slurm_batch: 5,
  nersc_job_status: 5,
  nersc_copy_results_to_cfs: 5
} as const

// Server configuration
export const SERVER = {
  PORT: 3000
} as const

// NERSC paths
// TODO: Make this configurable via environment variable
export const NERSC_PATHS = {
  SCRIPT_LOGS_DIR: '/global/homes/s/sclassen/script-logs'
} as const
