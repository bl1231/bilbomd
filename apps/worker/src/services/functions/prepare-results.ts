import { promisify } from 'util'
import { exec } from 'node:child_process'
import readline from 'node:readline'
// import { FileCopyParams } from '../../types/index.js'
import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob
} from '@bilbomd/mongodb-schema'
import path from 'path'
import fs from 'fs-extra'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { makeDir, handleError } from './job-utils.js'
import { createReadmeFile } from './create-readme-file.js'
import { spawnFeedbackScript } from './feedback.js'
import { spawnRgyrDmaxScript } from './analysis.js'
import { assembleEnsemblePdbFiles } from './assemble-ensemble-pdb-file.js'

const execPromise = promisify(exec)

const prepareResults = async (
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
): Promise<void> => {
  try {
    const jobDir = path.join(config.uploadDir, DBjob.uuid)
    const multiFoxsDir = path.join(jobDir, 'multifoxs')
    const logFile = path.join(multiFoxsDir, 'multi_foxs.log')
    const resultsDir = path.join(jobDir, 'results')

    // Create new empty results directory
    try {
      await makeDir(resultsDir)
    } catch (error) {
      logger.error(`Error creating results directory: ${error}`)
    }

    {
      const baseDataName = DBjob.data_file.split('.')[0]
      const charmmPdb = path.join(jobDir, 'minimization_output.pdb')
      const openmmPdb = path.join(jobDir, 'minimize', 'minimized.pdb')

      const pdbSource = (await fs.pathExists(openmmPdb))
        ? openmmPdb
        : (await fs.pathExists(charmmPdb))
          ? charmmPdb
          : null

      if (pdbSource) {
        await copyFiles({
          source: pdbSource,
          destination: resultsDir,
          filename: path.basename(pdbSource),
          isCritical: false
        })
      } else {
        logger.warn(
          'No minimized PDB found (checked OpenMM and CHARMM locations).'
        )
      }

      // --- Copy the DAT file for the minimized PDB (supports both layouts)
      const charmmDat = path.join(
        jobDir,
        `minimization_output_${baseDataName}.dat`
      )
      const openmmDat = path.join(
        jobDir,
        'minimize',
        `minimized_${baseDataName}.dat`
      )

      const datSource = (await fs.pathExists(openmmDat))
        ? openmmDat
        : (await fs.pathExists(charmmDat))
          ? charmmDat
          : null

      if (datSource) {
        await copyFiles({
          source: datSource,
          destination: resultsDir,
          filename: path.basename(datSource),
          isCritical: false
        })
      } else {
        logger.warn(
          'No minimized DAT file found (checked OpenMM and CHARMM locations).'
        )
      }
    }

    // Copy ensemble_size_*.txt files
    await copyFiles({
      source: `${multiFoxsDir}/ensembles_size*.txt`,
      destination: resultsDir,
      filename: 'ensembles_size*.txt',
      isCritical: false
    })

    // Copy multi_state_model_*_1_1.dat files
    await copyFiles({
      source: `${multiFoxsDir}/multi_state_model_*_1_1.dat`,
      destination: resultsDir,
      filename: 'multi_state_model_*_1_1.dat',
      isCritical: false
    })

    // Gather original uploaded files
    const filesToCopy = [{ file: DBjob.data_file, label: 'data_file' }]

    if ('pdb_file' in DBjob && DBjob.pdb_file) {
      filesToCopy.push({ file: DBjob.pdb_file, label: 'pdb_file' })
    }

    if ('crd_file' in DBjob && DBjob.crd_file) {
      filesToCopy.push({ file: DBjob.crd_file, label: 'crd_file' })
    }

    if ('psf_file' in DBjob && DBjob.psf_file) {
      filesToCopy.push({ file: DBjob.psf_file, label: 'psf_file' })
    }

    if ('pae_file' in DBjob && DBjob.pae_file) {
      filesToCopy.push({ file: DBjob.pae_file, label: 'pae_file' })
    }

    if ('const_inp_file' in DBjob && DBjob.const_inp_file) {
      filesToCopy.push({ file: DBjob.const_inp_file, label: 'const_inp_file' })
    }

    // FASTA file generated from the alphafold_entities
    if ('fasta_file' in DBjob && DBjob.fasta_file) {
      filesToCopy.push({ file: DBjob.fasta_file, label: 'fasta_file' })
    }

    // Additional AlphaFold-specific files
    // These files are not present in MongoDB because we currently do not update
    // MongoDB during a NERSC job.
    if (DBjob.__t === 'BilboMdAlphaFold') {
      const alphafoldExtraFiles = [
        'af-pae.json',
        'af-rank1.pdb',
        'bilbomd_pdb2crd.psf',
        'bilbomd_pdb2crd.crd'
      ]
      alphafoldExtraFiles.forEach((file) => {
        filesToCopy.push({ file, label: file })
      })
    }

    // OpenMM-specific files to copy
    if (DBjob.md_engine === 'OpenMM') {
      const openmmFiles = [
        'openmm_const.yml',
        'openmm_config.yaml',
        'pae.png',
        'viz.png'
      ]
      openmmFiles.forEach((file) => {
        filesToCopy.push({ file, label: file })
      })
    }

    for (const { file, label } of filesToCopy) {
      if (file) {
        await copyFiles({
          source: path.join(jobDir, file),
          destination: resultsDir,
          filename: label,
          isCritical: false
        })
      } else {
        logger.warn(`Expected file for '${label}' is undefined.`)
      }
    }

    // Only want to add N best PDBs equal to number_of_states N in logfile.
    const numEnsembles = await getNumEnsembles(logFile)
    logger.info(`prepareResults numEnsembles: ${numEnsembles}`)

    if (numEnsembles) {
      await assembleEnsemblePdbFiles({
        numEnsembles,
        multiFoxsDir,
        jobDir,
        resultsDir
      })
    }

    // Write the DBjob to a JSON file
    try {
      const dbJobJsonPath = path.join(resultsDir, 'bilbomd_job.json')
      await fs.writeFile(dbJobJsonPath, JSON.stringify(DBjob, null, 2), 'utf8')
    } catch (error) {
      logger.error(`Error writing DBjob JSON file: ${error}`)
    }

    // scripts/pipeline_decision_tree.py
    try {
      await spawnFeedbackScript(DBjob)
    } catch (error) {
      logger.error(`Error running feedback script: ${error}`)
    }

    // create the rgyr vs. dmax multifoxs ensembles plots
    try {
      await spawnRgyrDmaxScript(DBjob)
    } catch (error) {
      logger.error(`Error running Rgyr vs. Dmax script: ${error}`)
    }

    // Create Job-specific README file.
    try {
      await createReadmeFile(DBjob, numEnsembles, resultsDir)
    } catch (error) {
      logger.error(`Error creating README file: ${error}`)
    }

    // Create the results tar.gz file
    try {
      const uuidPrefix = DBjob.uuid.split('-')[0]
      const archiveName = `results-${uuidPrefix}.tar.gz`
      await execPromise(`tar czvf ${archiveName} results`, { cwd: jobDir })
    } catch (error) {
      logger.error(`Error creating tar file: ${error}`)
      throw error // Critical error, rethrow or handle specifically if necessary
    }
  } catch (error) {
    await handleError(error, DBjob, 'results')
  }
}

const copyFiles = async ({
  source,
  destination,
  filename,
  isCritical
}: FileCopyParams): Promise<void> => {
  try {
    await execPromise(`cp ${source} ${destination}`)
  } catch (error) {
    logger.error(`Error copying ${filename}: ${error}`)
    if (isCritical) {
      throw new Error(`Critical error copying ${filename}: ${error}`)
    }
  }
}

const getNumEnsembles = async (logFile: string): Promise<number> => {
  const rl = readline.createInterface({
    input: fs.createReadStream(logFile),
    crlfDelay: Infinity
  })
  const regex = /(?:number_of_states[ ])([\d]+)/
  const ensembleCount = ['0']
  for await (const line of rl) {
    const found = line.match(regex)
    if (found !== null) {
      ensembleCount.push(found[1])
    }
  }
  return Number(ensembleCount.pop())
}

export { prepareResults, getNumEnsembles }
