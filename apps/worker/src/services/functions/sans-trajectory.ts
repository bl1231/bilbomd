import path from 'path'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'
import { IStepStatus, IBilboMDSANSJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { updateStepStatus } from './mongo-utils.js'
import {
  makeDir,
  makeFile,
  generateDCD2PDBInpFile,
  spawnCharmm
} from './job-utils.js'
import { writeSegidToChainid } from './bilbomd-functions.js'

// Turns SANS MD trajectories into per-run directories of PDBs under
// <jobDir>/pepsisans/, ready for Pepsi-SANS.

interface CharmmDCD2PDBParams {
  out_dir: string
  charmm_template: string
  charmm_topo_dir: string
  charmm_inp_file: string
  charmm_out_file: string
  in_psf_file: string
  in_crd_file: string
  inp_basename: string
  pepsisans_rg: string
  in_dcd: string
  run: string
}

const extractPDBFilesFromDCD = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)

  // Determine MD engine
  const engine = DBjob.md_engine ?? 'CHARMM'

  let status: IStepStatus = {
    status: 'Running',
    message: `${engine} Extract PDBs from DCD Trajectories has started.`
  }
  await updateStepStatus(DBjob, 'dcd2pdb', status)
  // Create the output directory for the PDB files
  const analysisDir = path.join(outputDir, 'pepsisans')
  await makeDir(analysisDir)
  // Create the output file for the Rg values from CHARMM
  const pepsisansRgFile = path.join(outputDir, 'pepsisans_rg.out')
  await makeFile(pepsisansRgFile)

  // Extract Rg values based on MD engine
  let rgValues: number[] = []
  if (engine === 'CHARMM') {
    if (
      'charmm_parameters' in DBjob &&
      Array.isArray(DBjob.charmm_parameters?.md?.rgyr)
    ) {
      rgValues = DBjob.charmm_parameters.md.rgyr
    } else {
      throw new Error(
        'CHARMM engine selected but charmm_parameters.md.rgyr not found'
      )
    }
  } else {
    if (
      'openmm_parameters' in DBjob &&
      Array.isArray(DBjob.openmm_parameters?.md?.rgyr)
    ) {
      rgValues = DBjob.openmm_parameters.md.rgyr
    } else {
      throw new Error(
        'OpenMM engine selected but openmm_parameters.md.rgyr not found'
      )
    }
  }

  // Parallelize the outer loop (Rg loop) using Promise.all, process each Rg group sequentially
  await Promise.all(
    rgValues.map(async (rg) => {
      logger.info(`Starting CHARMM DCD extraction for Rg=${rg}`)
      for (let run = 1; run <= DBjob.conformational_sampling; run++) {
        const runLabel = `rg${rg}_run${run}`
        const pepsiSANSRunDir = path.join(analysisDir, runLabel)
        await makeDir(pepsiSANSRunDir)

        // Move DCD2PDBParams definition inside the loop to ensure unique scope per task
        const dcdFilePath = path.join('charmm', 'md', `${runLabel}.dcd`)
        const DCD2PDBParams: CharmmDCD2PDBParams = {
          out_dir: outputDir,
          charmm_template: 'dcd2pdb-sans',
          charmm_topo_dir: config.charmmTopoDir,
          charmm_inp_file: `dcd2pdb-sans_${runLabel}.inp`,
          charmm_out_file: `dcd2pdb-sans_${runLabel}.out`,
          in_psf_file: 'bilbomd_pdb2crd.psf',
          in_crd_file: '',
          inp_basename: `dcd2pdb-sans_${runLabel}`,
          pepsisans_rg: 'pepsisans_rg.out',
          in_dcd: dcdFilePath,
          run: runLabel
        }

        await generateDCD2PDBInpFile(DCD2PDBParams, rg, run)
        await spawnCharmm(DCD2PDBParams, MQjob)
      }
    })
  )

  status = {
    status: 'Success',
    message: `${engine} Extract PDBs from DCD Trajectories has completed.`
  }
  await updateStepStatus(DBjob, 'dcd2pdb', status)
  logger.info('PDB extraction completed.')
}

const remediatePDBFiles = async (DBjob: IBilboMDSANSJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const analysisDir = path.join(outputDir, 'pepsisans')
  let status: IStepStatus = {
    status: 'Running',
    message: 'Remediating PDB files has started.'
  }
  await updateStepStatus(DBjob, 'pdb_remediate', status)
  // Read all subdirectories in analysisDir
  const pepsiSANSRunDirs = fs.readdirSync(analysisDir).filter((file) => {
    return fs.statSync(path.join(analysisDir, file)).isDirectory()
  })

  for (const dir of pepsiSANSRunDirs) {
    const pepsiSANSRunDir = path.join(analysisDir, dir)

    // Read all PDB files in the current directory
    const pdbFiles = fs.readdirSync(pepsiSANSRunDir).filter((file) => {
      return file.endsWith('.pdb')
    })

    for (const pdbFile of pdbFiles) {
      const pdbFilePath = path.join(pepsiSANSRunDir, pdbFile)
      await writeSegidToChainid(pdbFilePath)
    }
  }
  status = {
    status: 'Success',
    message: 'Remediating PDB files has completed.'
  }
  await updateStepStatus(DBjob, 'pdb_remediate', status)
  logger.info('All PDB files have been remediated.')
}

const mirrorOmmMdToPepsiSANS = async (
  DBjob: IBilboMDSANSJob
): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)
  const ommMdDir = path.join(workDir, 'openmm', 'md')
  const pepsiSANSDir = path.join(workDir, 'pepsisans')

  await fs.ensureDir(pepsiSANSDir)

  if (!(await fs.pathExists(ommMdDir))) {
    throw new Error(`OpenMM MD output directory not found: ${ommMdDir}`)
  }

  const entries = await fs.readdir(ommMdDir)
  const rgDirs = []
  for (const name of entries) {
    const fullPath = path.join(ommMdDir, name)
    if (/^rg_\d+$/.test(name) && (await fs.stat(fullPath)).isDirectory()) {
      rgDirs.push(name)
    }
  }

  if (rgDirs.length === 0) {
    throw new Error(`No rg_* directories found in ${ommMdDir}`)
  }

  for (const rgDir of rgDirs) {
    const srcDir = path.join(ommMdDir, rgDir)
    const match = rgDir.match(/^rg_(\d+)$/)
    if (!match) continue
    const normalizedName = `rg${match[1]}`
    const destDir = path.join(pepsiSANSDir, normalizedName)
    await fs.ensureDir(destDir)

    const files = await fs.readdir(srcDir)
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.pdb')) continue
      if (file.toLowerCase() === 'md.pdb') continue

      const src = path.join(srcDir, file)
      const dst = path.join(destDir, file)
      if (!(await fs.pathExists(dst))) {
        try {
          const rel = path.relative(path.dirname(dst), src)
          await fs.ensureSymlink(rel, dst)
        } catch {
          await fs.copy(src, dst)
        }
      }
    }
    logger.info(`Mirrored ${rgDir} -> pepsisans/${normalizedName}`)
  }
}

export { extractPDBFilesFromDCD, remediatePDBFiles, mirrorOmmMdToPepsiSANS }
