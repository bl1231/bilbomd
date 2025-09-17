import dotenv from 'dotenv'
dotenv.config()

const getEnvVar = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

export const config = {
  sendEmailNotifications: process.env.SEND_EMAIL_NOTIFICATIONS === 'true',
  bilbomdUrl: getEnvVar('BILBOMD_URL'),
  runOnNERSC: process.env.USE_NERSC === 'true',
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
  scripts: {
    prepareCHARMMSlurmScript: getEnvVar('PREPARE_CHARMM_SLURM_SCRIPT'),
    prepareOMMSlurmScript: getEnvVar('PREPARE_OMM_SLURM_SCRIPT'),
    copyFromScratchToCFSScript: getEnvVar('CP2CFS_SCRIPT'),
    dockerBuildScript: 'docker-build.sh'
  }
}
