import path from 'path'
import { Job as BullMQJob } from 'bullmq'
import {
  IStepStatus,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDSANSJob
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { updateStepStatus } from './mongo-utils.js'
import {
  makeDir,
  generateInputFile,
  spawnCharmm,
  handleError
} from './job-utils.js'

// CHARMM minimize -> heat -> dynamics, run in <jobDir>/charmm/<step>/

const runMinimize = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const charmmMinimizeDir = path.join(outputDir, 'charmm', 'minimize')

  // Create the charmm/minimize directory
  await makeDir(charmmMinimizeDir)

  const params: CharmmParams = {
    out_dir: charmmMinimizeDir,
    charmm_template: 'minimize',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: 'minimize.inp',
    charmm_out_file: 'minimize.out',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: DBjob.crd_file ?? ''
  }
  try {
    logger.info(`Starting CHARMM minimize for job ${DBjob.uuid}`)
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Minimization has started.'
    }
    await updateStepStatus(DBjob, 'minimize', status)
    await generateInputFile(params)
    await spawnCharmm(params, MQjob)
    status = {
      status: 'Success',
      message: 'CHARMM Minimization has completed.'
    }
    await updateStepStatus(DBjob, 'minimize', status)
    logger.info(`Completed CHARMM minimize for job ${DBjob.uuid}`)
  } catch (error: unknown) {
    await handleError(error, DBjob, 'minimize')
  }
}

const runHeat = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const charmmHeatDir = path.join(outputDir, 'charmm', 'heat')

  // Create the charmm/heat directory
  await makeDir(charmmHeatDir)

  const params: CharmmHeatParams = {
    out_dir: charmmHeatDir,
    charmm_template: 'heat',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: 'heat.inp',
    charmm_out_file: 'heat.out',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: 'minimization_output.crd',
    constinp: DBjob.const_inp_file ?? ''
  }
  try {
    logger.info(`Starting CHARMM heat for job ${DBjob.uuid}`)
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Heating has started.'
    }
    await updateStepStatus(DBjob, 'heat', status)
    await generateInputFile(params)
    await spawnCharmm(params, MQjob)
    status = {
      status: 'Success',
      message: 'CHARMM Heating has completed.'
    }
    await updateStepStatus(DBjob, 'heat', status)
    logger.info(`Completed CHARMM heat for job ${DBjob.uuid}`)
  } catch (error) {
    await handleError(error, DBjob, 'heat')
  }
}

const runMolecularDynamics = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const charmmMdDir = path.join(outputDir, 'charmm', 'md')

  // Create the charmm/md directory
  await makeDir(charmmMdDir)

  const params: CharmmMDParams = {
    out_dir: charmmMdDir,
    charmm_template: 'dynamics',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: '',
    charmm_out_file: '',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: '',
    constinp: DBjob.const_inp_file ?? '',
    rg_min: DBjob.rg_min ?? 20,
    rg_max: DBjob.rg_max ?? 60,
    conf_sample: DBjob.conformational_sampling,
    timestep: 0.001,
    inp_basename: '',
    rg: 0
  }

  try {
    logger.info(`Starting CHARMM MD for job ${DBjob.uuid}`)
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Molecular Dynamics has started.'
    }
    await updateStepStatus(DBjob, 'md', status)
    const molecularDynamicsTasks = []
    let rgyrList: number[] = []
    if (
      'charmm_parameters' in DBjob &&
      Array.isArray(DBjob.charmm_parameters?.md?.rgyr)
    ) {
      rgyrList = DBjob.charmm_parameters.md.rgyr
    }
    for (const rg of rgyrList) {
      params.charmm_inp_file = `${params.charmm_template}_rg${rg}.inp`
      params.charmm_out_file = `${params.charmm_template}_rg${rg}.out`
      params.inp_basename = `${params.charmm_template}_rg${rg}`
      params.rg = rg
      await generateInputFile(params)
      molecularDynamicsTasks.push(spawnCharmm(params, MQjob))
    }
    await Promise.all(molecularDynamicsTasks)
    status = {
      status: 'Success',
      message: 'CHARMM Molecular Dynamics has completed.'
    }
    await updateStepStatus(DBjob, 'md', status)
    logger.info(`Completed CHARMM MD for job ${DBjob.uuid}`)
  } catch (error) {
    await handleError(error, DBjob, 'md')
  }
}

export { runMinimize, runHeat, runMolecularDynamics }
