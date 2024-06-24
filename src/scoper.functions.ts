import { logger } from './helpers/loggers'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'
// import { IBilboMDScoperJob } from './model/Job.js'
import { IBilboMDScoperJob } from '@bl1231/bilbomd-mongodb-schema'
import { promisify } from 'util'
import { exec } from 'node:child_process'

const execPromise = promisify(exec)

const DATA_VOL = process.env.DATA_VOL ?? '/bilbomd/uploads'
const IONNET_DIR = process.env.IONNET_DIR ?? '/home/scoper/IonNet'
const SCOPER_KGS_CONFORMERS = process.env.SCOPER_KGS_CONFORMERS ?? '111'

const runScoper = async (MQjob: BullMQJob, DBjob: IBilboMDScoperJob): Promise<void> => {
  const outputDir = path.join(DATA_VOL, DBjob.uuid)
  const logFile = path.join(outputDir, 'scoper.log')
  const errorFile = path.join(outputDir, 'scoper_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  // const args = [SCOPER_SCRIPT, DBjob.pdb_file, DBjob.data_file, outputDir]
  // prettier-ignore
  const args = [
    path.join(IONNET_DIR, 'mgclassifierv2.py'),
    '-bd',
    outputDir,
    'scoper',
    '-fp',
    path.join(outputDir, DBjob.pdb_file),
    '-ahs',
    path.join(IONNET_DIR, 'scripts', 'scoper_scripts', 'addHydrogensColab.pl'),
    '-sp',
    path.join(outputDir, DBjob.data_file),
    '-it',
    'sax',
    '-mp',
    path.join(IONNET_DIR, 'models/trained_models/wandering-tree-178.pt'),
    '-cp',
    path.join(IONNET_DIR, 'models/trained_models/wandering-tree-178_config.npy'),
    '-fs',
    'foxs',
    '-mfcs',
    'multi_foxs_combination',
    '-kk',
    SCOPER_KGS_CONFORMERS,
    '-tk',
    '1',
    '-mfs',
    'multi_foxs',
    '-mfr',
    'True'
  ]

  return new Promise<void>((resolve, reject) => {
    // logger.info(`Running scoper with args: ${['-u', ...args].join(' ')}`)
    const scoper = spawn('python', ['-u', ...args], { cwd: outputDir })

    scoper.stdout?.on('data', (data) => {
      logStream.write(data.toString())
    })

    scoper.stderr?.on('data', (data) => {
      errorStream.write(data.toString())
    })

    scoper.on('error', (error) => {
      errorStream.end()
      reject(error)
    })

    scoper.on('exit', (code) => {
      logStream.end()
      errorStream.end()
      // This code is for determining teh "newpdb_##" directory.
      const processExitLogic = async () => {
        if (code === 0) {
          logger.info('scoper process exited successfully. Processing log file...')
          MQjob.log('scoper process successfully')
          try {
            const dirName = await findTopKDirFromLog(logFile)
            if (dirName) {
              logger.info('Found directory:', dirName)
              const dirNameFilePath = path.join(outputDir, 'top_k_dirname.txt')
              await fs.writeFile(dirNameFilePath, dirName)
            } else {
              logger.info('Directory not found in log file')
            }
            resolve()
          } catch (error) {
            console.error('Error processing log file:', error)
            reject(error)
          }
        } else {
          reject(`runScoper on close reject`)
        }
      }
      processExitLogic()
    })
  })
}

const findTopKDirFromLog = async (logFilePath: string): Promise<string | null> => {
  try {
    const logContent = await fs.readFile(logFilePath, 'utf-8')
    const lines = logContent.split('\n')

    for (const line of lines) {
      if (line.startsWith('top_k_pdbs:')) {
        const match = line.match(/\('newpdb_(\d+)\.pdb',/)
        if (match && match[1]) {
          return `newpdb_${match[1]}`
        }
        break // Stop searching after finding the line
      }
    }
  } catch (error) {
    console.error('Error reading log file:', error)
  }

  return null
}

const prepareScoperResults = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDScoperJob
): Promise<void> => {
  try {
    const outputDir = path.join(DATA_VOL, DBjob.uuid)
    const resultsDir = path.join(outputDir, 'results')

    await makeDir(resultsDir)
    MQjob.log('create results directory')

    const newpdbDir = await readDirNameFromFile(path.join(outputDir, 'top_k_dirname.txt'))
    if (!newpdbDir) {
      MQjob.log('error Top K directory name not found')
      throw new Error('Top K directory name not found')
    }

    const topKDir = path.join(outputDir, newpdbDir)
    const exists = await directoryExists(topKDir)
    if (!exists) {
      MQjob.log('error Top K directory not found')
      throw new Error('Top K directory not found')
    }

    const match = newpdbDir.match(/newpdb_(\d+)/)
    const pdbNumber = match ? parseInt(match[1], 10) : null
    if (!pdbNumber) {
      MQjob.log('error Could not determine PDB number')
      throw new Error('Could not determine PDB number')
    }

    MQjob.log(`best KGSrna model is #${pdbNumber}`)

    const rnaFile = path.join(topKDir, `newpdb_${pdbNumber}_rna_.pdb`)
    const probeFile = path.join(topKDir, `new_probe_newpdb_${pdbNumber}_probes.pdb`)

    const rnaExists = await fileExists(rnaFile)
    const probeExists = await fileExists(probeFile)

    if (!rnaExists || !probeExists) {
      throw new Error('RNA and/or Mg files not found')
    }

    const rnaContent = await fs.readFile(rnaFile, 'utf-8')
    await cleanProbeFile(probeFile)
    const probeContent = await fs.readFile(probeFile, 'utf-8')

    const combinedContent = rnaContent + '\n' + probeContent
    const outputFile = path.join(outputDir, `scoper_combined_newpdb_${pdbNumber}.pdb`)

    // Write the final combined PDB file.
    await fs.writeFile(outputFile, combinedContent)
    MQjob.log(`combine RNA and Mg: scoper_combined_newpdb_${pdbNumber}.pdb`)

    // FoXS analysis here
    await runFoXS(MQjob, DBjob, pdbNumber)
    MQjob.log('running FoXS analysis of Scoper PDB file')

    // Prepare a custom README file to be included with results
    await createReadmeFile(DBjob, pdbNumber, resultsDir)
    MQjob.log('Custom README file created')

    // Gather results and tar.gz
    await prepareResultsArchiveFile(DBjob, MQjob, pdbNumber, resultsDir)
    MQjob.log('created results.tar.gz file')
  } catch (error) {
    console.error('Error gathering Scoper results:', error)
  }
}

const runFoXS = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDScoperJob,
  pdbNumber: number
): Promise<void> => {
  const outputDir = path.join(DATA_VOL, DBjob.uuid)
  const foxsAnalysisDir = path.join(DATA_VOL, DBjob.uuid, 'foxs_analysis')
  await makeDir(foxsAnalysisDir)
  const logFile = path.join(foxsAnalysisDir, 'foxs.log')
  const errorFile = path.join(foxsAnalysisDir, 'foxs_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const inputPDB = DBjob.pdb_file
  const scoperPDB = `scoper_combined_newpdb_${pdbNumber}.pdb`
  const inputDAT = DBjob.data_file

  const filesToCopy = [inputPDB, inputDAT, scoperPDB]
  for (const file of filesToCopy) {
    await execPromise(`cp ${path.join(outputDir, file)} .`, { cwd: foxsAnalysisDir })
    // MQjob.log(`gather ${file}`)
  }

  const foxsArgs = [
    '-p',
    '--min_c1=0.99',
    '--max_c1=1.05',
    '--min_c2=-0.5',
    '--max_c2=2.0',
    inputPDB,
    scoperPDB,
    inputDAT
  ]

  return new Promise<void>((resolve, reject) => {
    const foxs = spawn('foxs', foxsArgs, { cwd: foxsAnalysisDir })
    foxs.stdout?.on('data', (data) => {
      logStream.write(data.toString())
    })

    foxs.stderr?.on('data', (data) => {
      errorStream.write(data.toString())
    })

    foxs.on('error', (error) => {
      errorStream.end()
      reject(error)
    })

    foxs.on('exit', (code) => {
      logStream.end()
      errorStream.end()

      if (code === 0) {
        console.log('foxs analysis exited successfully')
        MQjob.log('foxs analysis successful')
        resolve()
      } else {
        reject(`runFoXS on close reject`)
      }
    })
  })
}

const createReadmeFile = async (
  DBjob: IBilboMDScoperJob,
  pdbNumber: number,
  resultsDir: string
) => {
  const datFileBase = DBjob.data_file.split('.')[0]
  const pdbFileBase = DBjob.pdb_file.split('.')[0]

  const readmeContent = `
# Scoper Job Results

This directory contains the results for the Scoper job titled: "${DBjob.title}".

- Job ID: ${DBjob._id}
- UUID: ${DBjob.uuid}
- Submitted: ${DBjob.time_submitted}
- Completed: ${new Date().toString()}

## Contents

- Original PDB: ${DBjob.pdb_file}
- Original experimental SAXS data file: ${DBjob.data_file}
- Scoper log file: scoper.log
- Scoper combined RNA and Mg structure: scoper_combined_newpdb_${pdbNumber}.pdb
- SAXS-fit (FoXS) for original RNA model: scoper_combined_newpdb_${pdbNumber}_${datFileBase}.dat
- SAXS-fit (FoXS) for SCOPER RNA model: ${pdbFileBase}_${datFileBase}.dat

## Analysis

The analysis was performed using Scoper with the best KGSrna model being #${pdbNumber}.

The SAXS-fit file header contains:

# SAXS profile: number of points = 897, q_min = 0.0195109993219376, q_max = 0.47340801358223, delta_q = 0.00050658148912979
# offset = 0.00000000000000, scaling c = 2.54103876971280e-06, Chi^2 = 1.94736383321382
#  q       exp_intensity   model_intensity error
0.01951100 25.86433029     26.16198123     1.75902545
0.02001800 25.68120575     26.08003273     1.90469468
0.02052400 26.61764336     25.99478342     2.41470337
...
..
.

Where Chi^2 is a goodness of fit. The program RAW can read the fit: 
https://bioxtas-raw.readthedocs.io/en/latest/index.html

If you use SCOPER in your research, please cite the paper:

Predicting RNA structure and dynamics with deep learning and solution scattering
Edan Patt, Scott Classen, Michal Hammel, Dina Schneidman,  NAR 2024

Thank you for using SCOPER.

`

  const readmePath = path.join(resultsDir, 'README.md')
  await fs.writeFile(readmePath, readmeContent)
  console.log('README file created successfully.')
}

const prepareResultsArchiveFile = async (
  DBjob: IBilboMDScoperJob,
  MQjob: BullMQJob,
  pdbNumber: number,
  resultsDir: string
): Promise<void> => {
  const outputDir = path.join(DATA_VOL, DBjob.uuid)
  const outputFile = path.join(outputDir, `scoper_combined_newpdb_${pdbNumber}.pdb`)
  const foxsAnalysisDir = path.join(DATA_VOL, DBjob.uuid, 'foxs_analysis')
  // Copy the final combined PDB file.
  await execPromise(`cp ${outputFile} .`, { cwd: resultsDir })
  MQjob.log(`gather scoper_combined_newpdb_${pdbNumber}.pdb`)

  // Copy the original uploaded pdb and dat files
  const coordFilesToCopy = [DBjob.pdb_file, DBjob.data_file]
  for (const file of coordFilesToCopy) {
    await execPromise(`cp ${path.join(outputDir, file)} .`, { cwd: resultsDir })
    MQjob.log(`gather ${file}`)
  }
  // Copy the log file(s)
  const logFilesToCopy = ['scoper.log']
  for (const file of logFilesToCopy) {
    await execPromise(`cp ${path.join(outputDir, file)} .`, { cwd: resultsDir })
    MQjob.log(`gather ${file}`)
  }
  // Copy the FoXS dat files
  const datFileBase = DBjob.data_file.split('.')[0]
  const pdbFileBase = DBjob.pdb_file.split('.')[0]
  const foxsFilesToCopy = [
    `scoper_combined_newpdb_${pdbNumber}_${datFileBase}.dat`,
    `${pdbFileBase}_${datFileBase}.dat`
  ]
  for (const file of foxsFilesToCopy) {
    await execPromise(`cp ${path.join(foxsAnalysisDir, file)} .`, { cwd: resultsDir })
    MQjob.log(`gather ${file}`)
  }
  await execPromise(`tar czvf results.tar.gz results`, { cwd: outputDir })
}

const readDirNameFromFile = async (filePath: string): Promise<string | null> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content.trim()
  } catch (error) {
    console.error('Error reading file:', error)
    return null
  }
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const directoryExists = async (dirPath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

const makeDir = async (directory: string) => {
  await fs.ensureDir(directory)
  console.log('Create Dir: ', directory)
}

const cleanProbeFile = async (probeFile: string): Promise<void> => {
  try {
    let content = await fs.readFile(probeFile, 'utf-8')

    content = content.replace(/ PB {2}UNK/g, 'MG    MG')
    content = content.replace(/ATOM {2}/g, 'HETATM')

    await fs.writeFile(probeFile, content)
  } catch (error) {
    console.error('Error modifying probe file:', error)
  }
}

export { runScoper, prepareScoperResults }
