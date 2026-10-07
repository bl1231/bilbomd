import path from 'path'
import fs from 'fs-extra'
import { IJob } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { runCifToPdb } from './pdb-to-crd.js'

// gen-openmm-slurm-file.py runs on a Perlmutter login node and reads pdb_file
// from params.json to strip waters/ions and pick the force field before any
// Slurm step runs, so inputs it can't read have to be fixed up here first.

const setParamsPdbFile = async (uuid: string, pdbFile: string) => {
  const paramsPath = path.join(config.uploadDir, uuid, 'params.json')
  const params = await fs.readJson(paramsPath)
  params.pdb_file = pdbFile
  const tmpPath = `${paramsPath}.tmp`
  await fs.writeJson(tmpPath, params, { spaces: 2 })
  await fs.rename(tmpPath, paramsPath)
}

// Convert an uploaded mmCIF to PDB with the same script the beamline
// pipelines run (cifToPdbStep), and point the job and params.json at it.
const prepareNerscInputs = async (job: IJob): Promise<void> => {
  const pdbFile = job.get('pdb_file') as string | undefined
  if (!pdbFile?.toLowerCase().endsWith('.cif')) return

  const converted = await runCifToPdb({ uuid: job.uuid, pdb_file: pdbFile })
  job.set('pdb_file', converted)
  await job.save()
  await setParamsPdbFile(job.uuid, converted)
  logger.info(`prepareNerscInputs: ${job.uuid} now uses ${converted}`)
}

export { prepareNerscInputs }
