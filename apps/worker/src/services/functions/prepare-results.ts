import { promisify } from 'util'
import { execFile } from 'node:child_process'
import readline from 'node:readline'
import { glob } from 'glob'
import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob
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

const execFilePromise = promisify(execFile)

const prepareResults = async (
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
): Promise<void> => {
  try {
    const jobDir = path.join(config.uploadDir, DBjob.uuid)
    const multiFoxsDir = path.join(jobDir, 'multifoxs')
    const multiFoxsLogFile = path.join(multiFoxsDir, 'multi_foxs.log')
    const resultsDir = path.join(jobDir, 'results')

    // Create new empty results directory
    try {
      await makeDir(resultsDir)
    } catch (error) {
      logger.error(`Error creating results directory: ${error}`)
    }

    {
      const baseDataName = DBjob.data_file.split('.')[0]
      const openmmPdb = path.join(
        jobDir,
        'openmm',
        'minimize',
        'minimized.pdb'
      )
      const charmmNewPdb = path.join(
        jobDir,
        'charmm',
        'minimize',
        'minimization_output.pdb'
      )
      const charmmOldPdb = path.join(jobDir, 'minimization_output.pdb')

      const pdbSource = (await fs.pathExists(openmmPdb))
        ? openmmPdb
        : (await fs.pathExists(charmmNewPdb))
          ? charmmNewPdb
          : (await fs.pathExists(charmmOldPdb))
            ? charmmOldPdb
            : null

      if (pdbSource) {
        await copyFiles({
          source: pdbSource,
          destination: resultsDir,
          filename: 'minimization_output.pdb',
          destFilename: 'minimization_output.pdb',
          isCritical: false
        })
      } else {
        logger.warn(
          'No minimized PDB found (checked OpenMM and CHARMM locations).'
        )
      }

      // Copy the DAT file for the minimized PDB (supports both layouts)
      const openmmDat = path.join(
        jobDir,
        'openmm',
        'minimize',
        `minimized_${baseDataName}.dat`
      )
      const charmmNewDat = path.join(
        jobDir,
        'charmm',
        'minimize',
        `minimization_output_${baseDataName}.dat`
      )
      const charmmOldDat = path.join(
        jobDir,
        `minimization_output_${baseDataName}.dat`
      )

      const datSource = (await fs.pathExists(openmmDat))
        ? openmmDat
        : (await fs.pathExists(charmmNewDat))
          ? charmmNewDat
          : (await fs.pathExists(charmmOldDat))
            ? charmmOldDat
            : null

      if (datSource) {
        const canonicalDatName = `minimization_output_${baseDataName}.dat`
        await copyFiles({
          source: datSource,
          destination: resultsDir,
          filename: canonicalDatName,
          destFilename: canonicalDatName,
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

    if (DBjob.__t === 'BilboMdOpenFold') {
      const openfoldExtraFiles = [
        'of3-pae.json',
        'of3-rank1.pdb',
        'bilbomd_pdb2crd.psf',
        'bilbomd_pdb2crd.crd'
      ]
      openfoldExtraFiles.forEach((file) => {
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
    const numEnsembles = await getNumEnsembles(multiFoxsLogFile)
    logger.info(`prepareResults numEnsembles: ${numEnsembles}`)

    if (numEnsembles) {
      await assembleEnsemblePdbFiles({
        DBjob
      })
    }

    // Run feedback script before writing bilbomd_job.json so the snapshot
    // reflects any feedback fields saved back to MongoDB during the script
    try {
      await spawnFeedbackScript(DBjob)
    } catch (error) {
      logger.error(`Error running feedback script: ${error}`)
    }

    // Write DBjob snapshot after feedback so it includes feedback fields
    try {
      await writeJsonFile(path.join(resultsDir, 'bilbomd_job.json'), DBjob)
    } catch (error) {
      logger.error(`Error writing DBjob JSON file: ${error}`)
    }

    // create the rgyr vs. dmax multifoxs ensembles plots
    try {
      await spawnRgyrDmaxScript(DBjob)
    } catch (error) {
      logger.error(`Error running Rgyr vs. Dmax script: ${error}`)
    }

    // Copy consolidated Rgyr/Dmax JSON — only present if the analysis script succeeded
    const rgyrDmaxJson = path.join(multiFoxsDir, 'consolidated_rgyr_dmax_data.json')
    if (await fs.pathExists(rgyrDmaxJson)) {
      await copyFiles({
        source: rgyrDmaxJson,
        destination: resultsDir,
        filename: 'consolidated_rgyr_dmax_data.json',
        isCritical: false
      })
    } else {
      logger.warn('consolidated_rgyr_dmax_data.json not found — Rgyr/Dmax analysis may have failed')
    }

    // Copy MultiFoXS log for debugging
    await copyFiles({
      source: multiFoxsLogFile,
      destination: resultsDir,
      filename: 'multi_foxs.log',
      isCritical: false
    })

    // Create Job-specific README file.
    try {
      await createReadmeFile(DBjob, numEnsembles, resultsDir)
    } catch (error) {
      logger.error(`Error creating README file: ${error}`)
    }

    // Create the results tar.gz file
    try {
      await createResultsArchive(jobDir, DBjob.uuid)
      DBjob.results_ready = true
      await DBjob.save()
    } catch (error) {
      DBjob.results_ready = false
      await DBjob.save()
      logger.error(`Error creating tar file: ${error}`)
      throw error
    }
  } catch (error) {
    await handleError(error, DBjob, 'results')
  }
}

const copyFiles = async ({
  source,
  destination,
  filename,
  isCritical,
  destFilename
}: FileCopyParams): Promise<void> => {
  try {
    if (source.includes('*')) {
      // Glob pattern — expand with glob library; no shell involved
      const matches = await glob(source)
      await Promise.all(
        matches.map((f) => fs.copy(f, path.join(destination, path.basename(f))))
      )
    } else {
      // Single file — use fs.copy to avoid shell interpretation of path characters
      if (!(await fs.pathExists(source))) {
        logger.warn(`File not found, skipping: ${filename}`)
        return
      }
      const destName = destFilename ?? path.basename(source)
      await fs.copy(source, path.join(destination, destName))
    }
  } catch (error) {
    logger.error(`Error copying ${filename}: ${error}`)
    if (isCritical) {
      throw new Error(`Critical error copying ${filename}: ${error}`)
    }
  }
}

const writeJsonFile = async (
  filePath: string,
  data: unknown
): Promise<void> => {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    logger.info(`JSON file written to: ${filePath}`)
  } catch (error) {
    logger.error(`Error writing JSON file to ${filePath}: ${error}`)
    throw error
  }
}

const createResultsArchive = async (
  jobDir: string,
  uuid: string
): Promise<void> => {
  const archiveName = `results-${uuid.split('-')[0]}.tar.gz`
  await execFilePromise('tar', ['czvf', archiveName, 'results'], { cwd: jobDir })
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

export {
  prepareResults,
  getNumEnsembles,
  copyFiles,
  writeJsonFile,
  createResultsArchive
}
