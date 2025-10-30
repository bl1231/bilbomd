import { promisify } from 'util'
import { exec } from 'node:child_process'
import readline from 'node:readline'
import { FileCopyParams } from '../../types/index.js'
import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob
} from '@bilbomd/mongodb-schema'
import { Job as BullMQJob } from 'bullmq'
import path from 'path'
import fs from 'fs-extra'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { makeDir, handleError } from './job-utils.js'
import { createReadmeFile } from './create-readme-file.js'
import { spawnFeedbackScript } from './feedback.js'
import { spawnRgyrDmaxScript } from './analysis.js'

const execPromise = promisify(exec)

const prepareResults = async (
  MQjob: BullMQJob,
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
      MQjob.log('Create results directory')
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
          filename: path.basename(pdbSource), // keep original filename
          MQjob,
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
          MQjob,
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
      MQjob,
      isCritical: false
    })

    // Copy multi_state_model_*_1_1.dat files
    await copyFiles({
      source: `${multiFoxsDir}/multi_state_model_*_1_1.dat`,
      destination: resultsDir,
      filename: 'multi_state_model_*_1_1.dat',
      MQjob,
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
          MQjob,
          isCritical: false
        })
      } else {
        logger.warn(`Expected file for '${label}' is undefined.`)
      }
    }

    // Only want to add N best PDBs equal to number_of_states N in logfile.
    const numEnsembles = await getNumEnsembles(logFile)
    logger.info(`prepareResults numEnsembles: ${numEnsembles}`)
    MQjob.log(`Gather ${numEnsembles} best ensembles`)

    if (numEnsembles) {
      // Iterate through each ensembles_siz_*.txt file
      for (let i = 1; i <= numEnsembles; i++) {
        const ensembleFile = path.join(multiFoxsDir, `ensembles_size_${i}.txt`)
        logger.info(`prepareResults ensembleFile: ${ensembleFile}`)
        const ensembleFileContent = await fs.readFile(ensembleFile, 'utf8')
        const pdbFilesRelative = extractPdbPaths(ensembleFileContent)

        const pdbFilesFullPath = pdbFilesRelative.map((item) =>
          path.join(jobDir, item)
        )
        // Extract the first N PDB files to string[]
        const numToCopy = Math.min(pdbFilesFullPath.length, i)
        const ensembleModelFiles = pdbFilesFullPath.slice(0, numToCopy)
        const ensembleSize = ensembleModelFiles.length
        await concatenateAndSaveAsEnsemble(
          ensembleModelFiles,
          ensembleSize,
          resultsDir
        )

        MQjob.log(
          `Gathered ${pdbFilesFullPath.length} PDB files from ensembles_size_${i}.txt`
        )
      }
    }

    // Write the DBjob to a JSON file
    try {
      const dbJobJsonPath = path.join(resultsDir, 'bilbomd_job.json')
      await fs.writeFile(dbJobJsonPath, JSON.stringify(DBjob, null, 2), 'utf8')
      MQjob.log(`DBjob data written to ${dbJobJsonPath}`)
    } catch (error) {
      logger.error(`Error writing DBjob JSON file: ${error}`)
    }

    // scripts/pipeline_decision_tree.py
    try {
      await spawnFeedbackScript(DBjob)
      MQjob.log(`Feedback script executed successfully`)
    } catch (error) {
      logger.error(`Error running feedback script: ${error}`)
    }

    // create the rgyr vs. dmax multifoxs ensembles plots
    try {
      await spawnRgyrDmaxScript(DBjob)
      MQjob.log(`Rgyr vs. Dmax script executed successfully`)
    } catch (error) {
      logger.error(`Error running Rgyr vs. Dmax script: ${error}`)
    }

    // Create Job-specific README file.
    try {
      await createReadmeFile(DBjob, numEnsembles, resultsDir)
      MQjob.log(`wrote README.md file`)
    } catch (error) {
      logger.error(`Error creating README file: ${error}`)
    }

    // Create the results tar.gz file
    try {
      const uuidPrefix = DBjob.uuid.split('-')[0]
      const archiveName = `results-${uuidPrefix}.tar.gz`
      await execPromise(`tar czvf ${archiveName} results`, { cwd: jobDir })
      MQjob.log(`created ${archiveName} file`)
    } catch (error) {
      logger.error(`Error creating tar file: ${error}`)
      throw error // Critical error, rethrow or handle specifically if necessary
    }
  } catch (error) {
    await handleError(error, MQjob, DBjob, 'results')
  }
}

const copyFiles = async ({
  source,
  destination,
  filename,
  MQjob,
  isCritical
}: FileCopyParams): Promise<void> => {
  try {
    await execPromise(`cp ${source} ${destination}`)
    MQjob.log(`Gathered ${filename}`)
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

const extractPdbPaths = (content: string): string[] => {
  const lines = content.split('\n')
  const pdbPaths = lines
    .filter((line) => line.includes('.pdb.dat'))
    .map((line) => {
      const match = line.match(/(\/[^|]+\.pdb.dat)/)
      if (match) {
        const fullPath = match[1]
        // Remove the .dat extension from the filename
        const filename = fullPath.replace(/\.dat$/, '')
        return filename
      }
      return ''
    })
  // Extracts all PDBs
  //
  // logger.info(`extractPdbPaths pdbPaths: ${pdbPaths}`)
  return pdbPaths
}

const concatenateAndSaveAsEnsemble = async (
  pdbFiles: string[],
  ensembleSize: number,
  resultsDir: string
) => {
  try {
    const concatenatedContent: string[] = []
    for (let i = 0; i < pdbFiles.length; i++) {
      // Read the content of each PDB file
      let content = await fs.readFile(pdbFiles[i], 'utf8')

      // Replace the word "END" with "ENDMDL"
      content = content.replace(/\bEND\n?$/, 'ENDMDL')

      // Concatenate the content with MODEL....N
      concatenatedContent.push(`MODEL       ${i + 1}`)
      concatenatedContent.push(content)
    }

    // Save the concatenated content to the ensemble file
    const ensembleFileName = `ensemble_size_${ensembleSize}_model.pdb`
    const ensembleFile = path.join(resultsDir, ensembleFileName)
    await fs.writeFile(ensembleFile, concatenatedContent.join('\n'))

    logger.info(`Ensemble file saved: ${ensembleFile}`)
  } catch (error) {
    logger.error(`Error: ${error}`)
  }
}

export {
  prepareResults,
  getNumEnsembles,
  extractPdbPaths,
  concatenateAndSaveAsEnsemble
}
