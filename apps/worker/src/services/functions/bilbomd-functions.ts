import {
  makeDir,
  makeFile,
  generateDCD2PDBInpFile,
  spawnCharmm,
  spawnFoXS
} from './job-utils.js'
import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IStepStatus
} from '@bl1231/bilbomd-mongodb-schema'
import path from 'path'
import { updateStepStatus } from './mongo-utils.js'
import { CharmmDCD2PDBParams } from '../../types/index.js'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'

interface FoxsRunDir {
  dir: string
  rg: number
  run: number
}

const extractPDBFilesFromDCD = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)

  const DCD2PDBParams: CharmmDCD2PDBParams = {
    out_dir: outputDir,
    charmm_template: 'dcd2pdb',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: '',
    charmm_out_file: '',
    in_psf_file: DBjob.psf_file,
    in_crd_file: '',
    inp_basename: '',
    in_dcd: '',
    run: ''
  }

  let status: IStepStatus = {
    status: 'Running',
    message: 'CHARMM Extract PDBs from DCD Trajectories has started.'
  }

  try {
    await updateStepStatus(DBjob, 'dcd2pdb', status)

    // Create the output directory for the PDB files
    const analysisDir = path.join(outputDir, 'foxs')
    await makeDir(analysisDir)

    // Create the output file for the Rg values from CHARMM
    const foxsRgFile = path.join(outputDir, 'foxs_rg.out')
    await makeFile(foxsRgFile)

    // Generate the array of FoXS directories
    const foxsRunDirs = generateFoxsRunDirs(analysisDir, DBjob)

    // Create the FoXS directories
    await Promise.all(foxsRunDirs.map(({ dir }) => makeDir(dir)))

    // Process each directory
    const DCD2PDBjobs = []
    for (const foxsDirInfo of foxsRunDirs) {
      const runParams = { ...DCD2PDBParams }
      DCD2PDBjobs.push(processFoxsRunDir(foxsDirInfo, runParams, MQjob))
    }
    await Promise.all(DCD2PDBjobs)

    status = {
      status: 'Success',
      message: 'CHARMM Extract PDBs from DCD Trajectories has completed.'
    }
    await updateStepStatus(DBjob, 'dcd2pdb', status)
    logger.info('PDB extraction completed.')
  } catch (error) {
    status = {
      status: 'Error',
      message: `Error during CHARMM Extract PDBs from DCD Trajectories: ${error.message}`
    }
    await updateStepStatus(DBjob, 'dcd2pdb', status)
    logger.error(`PDB extraction failed: ${error.message}`)
  }
}

const generateFoxsRunDirs = (
  analysisDir: string,
  DBjob: IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob
): FoxsRunDir[] => {
  const foxsRunDirs: FoxsRunDir[] = []
  const step = Math.max(Math.round((DBjob.rg_max - DBjob.rg_min) / 5), 1)

  for (let rg = DBjob.rg_min; rg <= DBjob.rg_max; rg += step) {
    for (let run = 1; run <= DBjob.conformational_sampling; run++) {
      const foxsRunDir = path.join(analysisDir, `rg${rg}_run${run}`)
      foxsRunDirs.push({ dir: foxsRunDir, rg, run })
    }
  }
  return foxsRunDirs
}

const processFoxsRunDir = async (
  foxsRunDirInfo: FoxsRunDir,
  DCD2PDBParams: CharmmDCD2PDBParams,
  MQJob?: BullMQJob
): Promise<void> => {
  const { rg, run } = foxsRunDirInfo

  // Update DCD2PDBParams
  DCD2PDBParams.charmm_inp_file = `${DCD2PDBParams.charmm_template}_rg${rg}_run${run}.inp`
  DCD2PDBParams.charmm_out_file = `${DCD2PDBParams.charmm_template}_rg${rg}_run${run}.out`
  DCD2PDBParams.inp_basename = `${DCD2PDBParams.charmm_template}_rg${rg}_run${run}`
  DCD2PDBParams.run = `rg${rg}_run${run}`

  // Process the directory
  await generateDCD2PDBInpFile(DCD2PDBParams, rg, run)
  await spawnCharmm(DCD2PDBParams, MQJob) // Run CHARMM to extract PDB
}

const remediatePDBFiles = async (
  DBjob: IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const analysisDir = path.join(outputDir, 'foxs')
  let status: IStepStatus = {
    status: 'Running',
    message: 'Remediating PDB files has started.'
  }

  try {
    await updateStepStatus(DBjob, 'pdb_remediate', status)

    // Read all subdirectories in analysisDir
    const foxsRunDirs = fs.readdirSync(analysisDir).filter((file) => {
      return fs.statSync(path.join(analysisDir, file)).isDirectory()
    })

    for (const dir of foxsRunDirs) {
      const foxsRunDir = path.join(analysisDir, dir)

      // Read all PDB files in the current directory
      const pdbFiles = fs.readdirSync(foxsRunDir).filter((file) => {
        return file.endsWith('.pdb')
      })

      for (const pdbFile of pdbFiles) {
        const pdbFilePath = path.join(foxsRunDir, pdbFile)
        await writeSegidToChainid(pdbFilePath)
      }
    }

    status = {
      status: 'Success',
      message: 'Remediating PDB files has completed.'
    }
    await updateStepStatus(DBjob, 'pdb_remediate', status)
    logger.info('All PDB files have been remediated.')
  } catch (error) {
    status = {
      status: 'Error',
      message: `Error during PDB file remediation: ${error.message}`
    }
    await updateStepStatus(DBjob, 'pdb_remediate', status)
    logger.error(`PDB remediation failed: ${error.message}`)
  }
}

const writeSegidToChainid = async (inputFile: string): Promise<void> => {
  try {
    const fileContent = await fs.promises.readFile(inputFile, 'utf-8')
    const lines = fileContent.split('\n')
    const modifiedLines = lines.map((line) => {
      // Check if the line is an ATOM or HETATM line
      if (/^(ATOM|HETATM)/.test(line)) {
        // Extract the segid (columns 73-76)
        const segid = line.substring(72, 76).trim()
        const lastChar = segid.slice(-1)

        // Replace the chainid (column 22) with the last character of the segid
        return line.substring(0, 21) + lastChar + line.substring(22)
      } else {
        // If not an ATOM or HETATM line, return the line as is
        return line
      }
    })

    // Join the modified lines and overwrite the original file
    await fs.promises.writeFile(inputFile, modifiedLines.join('\n'), 'utf-8')
    // logger.info(`Processed PDB file saved as ${inputFile}`)
  } catch (error) {
    logger.error('Error processing the PDB file:', error)
  }
}

const prepareFoXSInputs = async (
  DBjob: IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob
): Promise<string[]> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const foxsDir = path.join(jobDir, 'foxs')
  const mdDir = path.join(jobDir, 'md')

  const listDirs = (base: string): string[] => {
    if (!fs.existsSync(base)) return []
    return fs
      .readdirSync(base)
      .map((name) => path.join(base, name))
      .filter(
        (fullPath) => fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()
      )
  }

  const hasPdbs = (dir: string): boolean => {
    try {
      const files = fs.readdirSync(dir)
      return files.some((f) => f.toLowerCase().endsWith('.pdb'))
    } catch {
      return false
    }
  }

  // 1) Prefer already-prepared foxs/rg_* directories containing PDB files
  const foxsSubDirs = listDirs(foxsDir).filter(hasPdbs)
  if (foxsSubDirs.length > 0) return foxsSubDirs

  // 2) If none found, look for OpenMM md/rg_* directories and mirror them into foxs via symlinks
  const mdSubDirs = listDirs(mdDir).filter(hasPdbs)
  if (mdSubDirs.length === 0) return []

  // Ensure foxs directory exists
  await fs.ensureDir(foxsDir)

  const mirroredFoxsDirs: string[] = []
  for (const srcDir of mdSubDirs) {
    const baseName = path.basename(srcDir) // e.g., 'rg_27'
    const destDir = path.join(foxsDir, baseName.replace('rg_', 'rg')) // normalize 'rg_27' -> 'rg27'
    await fs.ensureDir(destDir)

    // Symlink all .pdb files from md/rg_* into foxs/rg*
    const entries = fs.readdirSync(srcDir)
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.pdb')) continue
      if (entry.toLowerCase() === 'md.pdb') continue
      const src = path.join(srcDir, entry)
      const dst = path.join(destDir, entry)
      try {
        // Use relative symlinks when possible
        if (!fs.existsSync(dst)) {
          const rel = path.relative(path.dirname(dst), src)
          await fs.ensureSymlink(rel, dst)
        }
      } catch (error) {
        // If symlink fails (e.g., on some filesystems), fall back to copying
        logger.error('Error creating symlink ', error)
        if (!fs.existsSync(dst)) {
          await fs.copy(src, dst)
        }
      }
    }
    if (hasPdbs(destDir)) mirroredFoxsDirs.push(destDir)
  }

  return mirroredFoxsDirs
}

const runFoXS = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob
): Promise<void> => {
  let status: IStepStatus = {
    status: 'Running',
    message: 'FoXS Calculations have started.'
  }
  let heartbeat: NodeJS.Timeout | null = null
  try {
    // Update the initial status
    await updateStepStatus(DBjob, 'foxs', status)

    // Discover or prepare FoXS input directories (supports OpenMM md/rg_* layout)
    const foxsRunDirs = await prepareFoXSInputs(DBjob)
    if (foxsRunDirs.length === 0) {
      throw new Error(
        'No FoXS input directories with PDB files were found under foxs/ or md/.'
      )
    }

    // Set up the heartbeat for monitoring
    if (MQjob) {
      heartbeat = setInterval(() => {
        MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
        MQjob.log(`Heartbeat: still running runFoXS`)
        logger.info(
          `runFoXS Heartbeat: still running FoXS for: ${
            DBjob.title
          } at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
        )
      }, 1000)
    }

    // Run FoXS on each directory
    const allFoxsJobs = foxsRunDirs.map((dir) => spawnFoXS(dir, MQjob))

    // Wait for all FoXS jobs to complete
    await Promise.all(allFoxsJobs)

    // Update status to Success once all jobs are complete
    status = {
      status: 'Success',
      message: 'FoXS Calculations have completed.'
    }
    await updateStepStatus(DBjob, 'foxs', status)
  } catch (error) {
    // Handle errors and update status to Error
    status = {
      status: 'Error',
      message: `Error in FoXS Calculations: ${error.message}`
    }
    await updateStepStatus(DBjob, 'foxs', status)
    logger.error(`FoXS calculations failed: ${error.message}`)
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

export { extractPDBFilesFromDCD, remediatePDBFiles, runFoXS }
