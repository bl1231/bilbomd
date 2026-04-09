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
  basePythonBin: getEnvVarWithDefault(
    'BASE_PYTHON_BIN',
    '/opt/envs/base/bin/python'
  ),
  logLevel: getEnvVarWithDefault('LOG_LEVEL', 'info'),
  scripts: {
    prepareCHARMMSlurmScript: getEnvVar('PREPARE_CHARMM_SLURM_SCRIPT'),
    prepareOMMSlurmScript: getEnvVar('PREPARE_OMM_SLURM_SCRIPT'),
    copyFromScratchToCFSScript: getEnvVar('CP2CFS_SCRIPT'),
    dockerBuildScript: 'docker-build.sh'
  },
  bilbomd: {
    SANSEnabled: toBoolean(process.env.ENABLE_BILBOMD_SANS),
    AlphaFoldEnabled: toBoolean(process.env.ENABLE_BILBOMD_ALPHAFOLD),
    MultiEnabled: toBoolean(process.env.ENABLE_BILBOMD_MULTI),
    ScoperEnabled: toBoolean(process.env.ENABLE_BILBOMD_SCOPER)
  }
}
