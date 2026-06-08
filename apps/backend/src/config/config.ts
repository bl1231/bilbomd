import dotenv from 'dotenv'
dotenv.config()

export const getEnvVar = (name: string): string => {
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

/**
 * Whether auth/session cookies should carry the `Secure` attribute (HTTPS-only).
 *
 * Browsers silently drop `Secure` cookies over plain HTTP, which breaks login,
 * token refresh, and the ORCID OAuth flow for installs accessed via http://
 * (e.g. http://localhost:3001 with no TLS-terminating proxy in front).
 *
 * Defaults to the previous behavior (`Secure` when BILBOMD_ENV=production). Set
 * COOKIE_SECURE=false to allow cookies over HTTP on such deployments, or
 * COOKIE_SECURE=true to force `Secure` regardless of BILBOMD_ENV.
 */
export const isCookieSecure = (): boolean =>
  process.env.COOKIE_SECURE !== undefined
    ? toBoolean(process.env.COOKIE_SECURE)
    : process.env.BILBOMD_ENV === 'production'

export const config = {
  sendEmailNotifications: toBoolean(process.env.SEND_EMAIL_NOTIFICATIONS),
  bullmqAttempts: process.env.BULLMQ_ATTEMPTS
    ? parseInt(process.env.BULLMQ_ATTEMPTS)
    : 3,
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
  },
  orcidAuthEnabled: toBoolean(process.env.ORCID_AUTH_ENABLED)
}
