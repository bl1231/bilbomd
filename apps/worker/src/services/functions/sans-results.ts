import path from 'path'
import fs from 'fs-extra'
import csv from 'csv-parser'
import { glob } from 'glob'
import {
  IStepStatus,
  IEnsemble,
  IBilboMDSANSJob
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { updateStepStatus } from './mongo-utils.js'
import { makeDir } from './job-utils.js'
import { copyFiles, createResultsArchive } from './prepare-results.js'
import { createReadmeFile } from './create-readme-file.js'
import { isBilboMDSANSJob } from './job-type-guards.js'

const prepareBilboMDSANSResults = async (
  DBjob: IBilboMDSANSJob
): Promise<void> => {
  let status: IStepStatus = {
    status: 'Running',
    message: 'Gathering BilboMD SANS results has started.'
  }
  try {
    await updateStepStatus(DBjob, 'results', status)

    if (isBilboMDSANSJob(DBjob)) {
      await prepareResults(DBjob)
      status = {
        status: 'Success',
        message: 'Gathering BilboMD SANS results successful.'
      }
      await updateStepStatus(DBjob, 'results', status)
    } else {
      throw new Error('Invalid job type')
    }
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    status = {
      status: 'Error',
      message: 'Gathering BilboMD SANS results error.'
    }
    await updateStepStatus(DBjob, 'results', status)
    logger.error(`Error during prepareBilboMDResults job: ${errorMessage}`)
  }
}

const prepareResults = async (DBjob: IBilboMDSANSJob): Promise<void> => {
  try {
    const jobDir = path.join(config.uploadDir, DBjob.uuid)
    const pepsisansDir = path.join(jobDir, 'pepsisans')
    const resultsDir = path.join(jobDir, 'results')

    // Create new empty results directory
    await makeDir(resultsDir)

    // Copy the minimized PDB — try OpenMM path, then new CHARMM layout, then legacy root
    const baseDataName = DBjob.data_file.split('.')[0]
    const openmmPdb = path.join(jobDir, 'openmm', 'minimize', 'minimized.pdb')
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

    // Copy the DAT file for the minimized PDB
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

    // Gather original uploaded files
    const filesToCopy = [
      { file: DBjob.data_file, label: 'data_file' },
      ...(DBjob.pdb_file ? [{ file: DBjob.pdb_file, label: 'pdb_file' }] : []),
      ...(DBjob.crd_file ? [{ file: DBjob.crd_file, label: 'crd_file' }] : []),
      ...(DBjob.psf_file ? [{ file: DBjob.psf_file, label: 'psf_file' }] : []),
      ...(DBjob.const_inp_file
        ? [{ file: DBjob.const_inp_file, label: 'const_inp_file' }]
        : [])
    ]

    // Gather GASANS ensemble Scattering Data CSV files
    const gasansCsvScatteringDataFiles = await glob(
      'best_model_EnsembleSize*.csv',
      {
        cwd: jobDir
      }
    )

    gasansCsvScatteringDataFiles.forEach((file) => {
      filesToCopy.push({ file, label: file })
    })

    // Gather GASANS ensemble summary CSV files
    const gasansSummaryFiles = await glob('gasans_summary_EnsSize*.csv', {
      cwd: jobDir
    })

    gasansSummaryFiles.forEach((file) => {
      filesToCopy.push({ file, label: file })
    })

    // Copy all files to the results directory
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

    // Catenate the "best" N-state ensemble PDB files
    for (const summaryFile of gasansSummaryFiles) {
      const ensembleNumber = summaryFile.match(/\d+/)?.[0] // Extract ensemble number
      logger.info(
        `Processing GASANS summary file for ensemble size ${ensembleNumber}`
      )
      if (!ensembleNumber) continue

      const summaryFilePath = path.join(jobDir, summaryFile)
      const csvData = await parseCsvFile(summaryFilePath)

      if (csvData.length === 0) {
        logger.warn(`No data found in ${summaryFile}`)
        continue
      }

      const bestEnsembleRow = csvData[0] // Get the first row of data (best ensemble)

      const pdbFilesToConcatenate: string[] = []
      const pdbNamePrefix = `PDBNAME_`
      const datDirectoryPrefix = `DAT_DIRECTORY_`

      for (let i = 1; i <= parseInt(ensembleNumber); i++) {
        const pdbFileName = bestEnsembleRow[`${pdbNamePrefix}${i}`]
        const datDirectory = bestEnsembleRow[`${datDirectoryPrefix}${i}`]

        if (pdbFileName && datDirectory) {
          const pdbFilePath = path.join(pepsisansDir, datDirectory, pdbFileName)
          pdbFilesToConcatenate.push(pdbFilePath)
        } else {
          logger.warn(
            `Missing PDB file or directory for ensemble size ${ensembleNumber}, index ${i}`
          )
        }
      }

      if (pdbFilesToConcatenate.length > 0) {
        const concatenatedPdbFile = path.join(
          resultsDir,
          `ensemble_size_${ensembleNumber}_model.pdb`
        )

        // Get the current date
        const currentDate = new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZoneName: 'short'
        }).format(new Date())

        // Generate the custom header
        const header = [
          `REMARK BilboMD SANS Best ${ensembleNumber}-State Ensemble`,
          `REMARK BilboMD Job UUID: ${DBjob.uuid}`,
          `REMARK Created on: ${currentDate}`,
          `REMARK This file was generated by concatenating the following PDB files:`,
          ...pdbFilesToConcatenate.map((filePath) => `REMARK ${filePath}`),
          `REMARK`
        ].join('\n')

        // Build a proper multi-model PDB with MODEL N / ENDMDL records so
        // Molstar can load each conformation as a separate assembly.
        const modelLines: string[] = []
        for (let i = 0; i < pdbFilesToConcatenate.length; i++) {
          let content = await fs.promises.readFile(
            pdbFilesToConcatenate[i],
            'utf-8'
          )
          content = content
            .split('\n')
            .filter((line) => !line.startsWith('REMARK'))
            .join('\n')
            .replace(/\bEND\n?$/, 'ENDMDL')
          modelLines.push(`MODEL       ${i + 1}`)
          modelLines.push(content)
        }

        const finalContent = [header, ...modelLines].join('\n')

        // Write the final content to the output file
        await fs.promises.writeFile(concatenatedPdbFile, finalContent, 'utf-8')

        logger.info(`Created multi-model PDB file: ${concatenatedPdbFile}`)
      }
    }

    // Store ensemble metadata in MongoDB so the Molstar viewer can load them.
    // Only the size field is required — the viewer uses it to build filenames
    // and to know how many MODEL records to load.
    const sansEnsembles: IEnsemble[] = gasansSummaryFiles
      .map((f) => ({
        size: parseInt(f.match(/\d+/)?.[0] ?? '0', 10),
        models: []
      }))
      .filter((e) => e.size > 0)
      .sort((a, b) => a.size - b.size)

    if (sansEnsembles.length > 0) {
      DBjob.results = DBjob.results || {}
      DBjob.results.sans = {
        total_num_ensembles: sansEnsembles.length,
        ensembles: sansEnsembles
      }
    }

    // Create Job-specific README file
    await createReadmeFile(DBjob, gasansSummaryFiles.length, resultsDir)

    // Create the results tar.gz file
    await createResultsArchive(jobDir, DBjob.uuid)
    DBjob.results_ready = true
    await DBjob.save()
  } catch (error) {
    DBjob.results_ready = false
    await DBjob.save()
    logger.error(`Error preparing results: ${error}`)
    throw error // Rethrow to handle further up the call stack if needed
  }
}

const parseCsvFile = (filePath: string): Promise<Record<string, string>[]> => {
  return new Promise((resolve, reject) => {
    const results: Record<string, string>[] = []

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error))
  })
}

export { prepareBilboMDSANSResults }
