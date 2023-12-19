import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'
import { IBilboMDScoperJob } from './model/Job.js'

const DATA_VOL = process.env.DATA_VOL ?? '/bilbomd/uploads'
const IONNET_DIR = process.env.IONNET_DIR ?? '/home/bun/IonNet'

const runScoper = async (MQjob: BullMQJob, DBjob: IBilboMDScoperJob): Promise<void> => {
  const outputDir = path.join(DATA_VOL, DBjob.uuid)
  const logFile = path.join(outputDir, 'run_scoper.log')
  const errorFile = path.join(outputDir, 'run_scoper_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  // const args = [SCOPER_SCRIPT, DBjob.pdb_file, DBjob.data_file, outputDir]
  // prettier-ignore
  const args = [
  path.join(IONNET_DIR, 'mgclassifierv2.py'),
  '-bd', outputDir,
  'scoper',
  '-fp', path.join(outputDir, DBjob.pdb_file),
  '-ahs', path.join(IONNET_DIR, 'scripts', 'scoper_scripts', 'addHydrogensColab.pl'),
  '-sp', path.join(outputDir,DBjob.data_file),
  '-it', 'sax',
  '-mp', path.join(IONNET_DIR, 'models/trained_models/wandering-tree-178.pt'),
  '-cp', path.join(IONNET_DIR, 'models/trained_models/wandering-tree-178_config.npy'),
  '-fs', 'foxs',
  '-mfcs', 'multi_foxs_combination',
  '-kk', '100',
  '-tk', '1',
  '-mfs', 'multi_foxs',
  '-mfr', 'True'
]

  return new Promise<void>((resolve, reject) => {
    const scoper = spawn('python', args, { cwd: outputDir })

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
          console.log('scoper process exited successfully. Processing log file...')
          MQjob.log('scoper process successfully.')
          try {
            const dirName = await findTopKDirFromLog(logFile)
            if (dirName) {
              console.log('Found directory:', dirName)
              const dirNameFilePath = path.join(outputDir, 'top_k_dirname.txt')
              await fs.writeFile(dirNameFilePath, dirName)
            } else {
              console.log('Directory not found in log file')
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
    const newpdbDir = await readDirNameFromFile(path.join(outputDir, 'top_k_dirname.txt'))
    if (newpdbDir) {
      const topKDir = path.join(outputDir, newpdbDir)
      const exists = await directoryExists(topKDir)
      if (exists) {
        const match = newpdbDir.match(/newpdb_(\d+)/)
        let pdbNumber = null
        if (match) {
          pdbNumber = parseInt(match[1], 10)
        }
        MQjob.log(`best KGSrna model is #${pdbNumber}`)
        const rnaFile = path.join(topKDir, `newpdb_${pdbNumber}_rna_.pdb`)
        const probeFile = path.join(topKDir, `new_probe_newpdb_${pdbNumber}_probes.pdb`)

        const rnaExists = await fileExists(rnaFile)
        const probeExists = await fileExists(probeFile)

        if (rnaExists && probeExists) {
          const rnaContent = await fs.readFile(rnaFile, 'utf-8')
          await modifyProbeFile(probeFile)
          const probeContent = await fs.readFile(probeFile, 'utf-8')

          const combinedContent = rnaContent + '\n' + probeContent
          const outputFile = path.join(
            outputDir,
            `scoper_combined_newpdb_${pdbNumber}.pdb`
          )

          await fs.writeFile(outputFile, combinedContent)
          MQjob.log(`combined RNA and Mg files: scoper_combined_newpdb_${pdbNumber}.pdb`)
        }
      }
    }
  } catch (error) {
    console.error('Error gathering Scoper results:', error)
  }
}

const readDirNameFromFile = async (filePath: string): Promise<string | null> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content.trim() // Trimming to remove any potential newline character at the end
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

const modifyProbeFile = async (probeFile: string): Promise<void> => {
  try {
    let content = await fs.readFile(probeFile, 'utf-8')

    // Replace "PB" with "MG" and "ATOM" with "HETATM"
    content = content.replace(/PB/g, 'MG')
    content = content.replace(/ATOM/g, 'HETATM')

    await fs.writeFile(probeFile, content)
  } catch (error) {
    console.error('Error modifying probe file:', error)
  }
}
export { runScoper, prepareScoperResults }
