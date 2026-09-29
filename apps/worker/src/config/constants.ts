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
  NERSC_TASK_POLL: 2_000 // 2 seconds
} as const

// NERSC API retry configuration
export const NERSC_RETRY = {
  MAX_ATTEMPTS: 11
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
