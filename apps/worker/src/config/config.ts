import dotenv from 'dotenv'
dotenv.config()

const getEnvVar = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

const toBoolean = (value?: string): boolean =>
  value === 'true' || value === '1' || value?.toLowerCase() === 'yes'

const getEnvVarWithDefault = (name: string, defaultValue: string): string => {
  return process.env[name] || defaultValue
}

const parsePositiveIntEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultValue
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Environment variable ${name}="${raw}" is not a positive number`
    )
  }
  return Math.floor(parsed)
}

const validateRequiredEnvVars = (): void => {
  const required = [
    'BILBOMD_URL',
    'SFAPI_URL',
    'SCRIPT_DIR',
    'UPLOAD_DIR',
    'WORK_DIR',
    'DATA_VOL',
    'CHARMM_TOPOLOGY',
    'CHARMM_TEMPLATES',
    'CHARMM',
    'FOXS',
    'MULTIFOXS',
    'PREPARE_CHARMM_SLURM_SCRIPT',
    'PREPARE_OMM_SLURM_SCRIPT',
    'CP2CFS_SCRIPT'
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }
}

// Validate required environment variables at module initialization
validateRequiredEnvVars()

export const config = {
  sendEmailNotifications: toBoolean(process.env.SEND_EMAIL_NOTIFICATIONS),
  bilbomdUrl: getEnvVar('BILBOMD_URL'),
  runOnNERSC: toBoolean(process.env.USE_NERSC),
  nerscBaseAPI: getEnvVar('SFAPI_URL'),
  nerscScriptDir: getEnvVar('SCRIPT_DIR'),
  nerscUploadDir: getEnvVar('UPLOAD_DIR'),
  nerscWorkDir: getEnvVar('WORK_DIR'),
  uploadDir: getEnvVar('DATA_VOL'),
  charmmTopoDir: getEnvVar('CHARMM_TOPOLOGY'),
  charmmTemplateDir: getEnvVar('CHARMM_TEMPLATES'),
  charmmBin: getEnvVar('CHARMM'),
  foxBin: getEnvVar('FOXS'),
  multifoxsBin: getEnvVar('MULTIFOXS'),
  openmmPythonBin: getEnvVarWithDefault(
    'OPENMM_PYTHON_BIN',
    '/opt/envs/openmm/bin/python'
  ),
  openmmMdConcurrency: parsePositiveIntEnv('OPENMM_MD_CONCURRENCY', 1),
  basePythonBin: getEnvVarWithDefault(
    'BASE_PYTHON_BIN',
    '/opt/envs/base/bin/python'
  ),
  colabfoldServiceUrl: getEnvVarWithDefault(
    'COLABFOLD_SERVICE_URL',
    'http://colabfold-service:8000'
  ),
  colabfoldTimeoutMs: parsePositiveIntEnv(
    'COLABFOLD_TIMEOUT_MS',
    60 * 60 * 1000
  ),
  of3ServiceUrl: getEnvVarWithDefault(
    'OF3_SERVICE_URL',
    'http://of3-service:8000'
  ),
  of3TimeoutMs: parsePositiveIntEnv('OF3_TIMEOUT_MS', 60 * 60 * 1000),
  logLevel: getEnvVarWithDefault('LOG_LEVEL', 'info'),
  // Per-process timeouts for external tools. Defaults are ~3-4x the longest
  // runs seen on production (epyc, Dec 2025 - Sep 2026) so they only catch
  // hangs; override per deployment for unusually large systems.
  processTimeouts: {
    // OpenMM minimize / heat: observed max < 1 min
    openmmSetupMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_OPENMM_SETUP_MS',
      60 * 60 * 1000
    ),
    // One OpenMM MD run (per Rg): observed max ~63 min
    openmmMdMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_OPENMM_MD_MS',
      4 * 60 * 60 * 1000
    )
  },
  scripts: {
    prepareCHARMMSlurmScript: getEnvVar('PREPARE_CHARMM_SLURM_SCRIPT'),
    prepareOMMSlurmScript: getEnvVar('PREPARE_OMM_SLURM_SCRIPT'),
    copyFromScratchToCFSScript: getEnvVar('CP2CFS_SCRIPT')
  },
  bilbomd: {
    SANSEnabled: toBoolean(process.env.ENABLE_BILBOMD_SANS),
    AlphaFoldEnabled: toBoolean(process.env.ENABLE_BILBOMD_ALPHAFOLD),
    OpenFoldEnabled: toBoolean(process.env.ENABLE_BILBOMD_OPENFOLD),
    MultiEnabled: toBoolean(process.env.ENABLE_BILBOMD_MULTI),
    ScoperEnabled: toBoolean(process.env.ENABLE_BILBOMD_SCOPER)
  }
}
