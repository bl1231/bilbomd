import readline from 'readline'
import path from 'path'
import fs from 'fs-extra'
import { IBilboMDScoperJob } from '@bl1231/bilbomd-mongodb-schema'
import { BilboMDScoperSteps } from '../../types/bilbomd.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const getScoperStatus = async (job: IBilboMDScoperJob): Promise<BilboMDScoperSteps> => {
  const scoper: BilboMDScoperSteps = {
    reduce: 'no',
    rnaview: 'no',
    kgs: 'no',
    kgsConformations: 0,
    kgsFiles: 0,
    foxs: 'no',
    foxsProgress: 0,
    foxsTopFile: '',
    foxsTopScore: 0,
    createdFeatures: false,
    IonNet: 'no',
    predictionThreshold: 0,
    multifoxs: 'no',
    multifoxsEnsembleSize: 0,
    multifoxsScore: 0,
    scoper: 'no',
    scoperPdb: '',
    results: 'no',
    email: 'no'
  }

  // scan the KGS output dir to calculate progress of KGS run
  const KGSOutputDir = path.join(uploadFolder, job.uuid, 'KGSRNA', job.pdb_file, 'output')
  const KGSFiles = await getKGSrnaProgress(KGSOutputDir)
  scoper.kgsFiles = KGSFiles

  // Can't scan the FoXS output directory at the moment since those files are
  // deleted almost immeadiatly.

  // Parse the scoper.log file fora slew of Scoper deets
  const scoperLogFile = path.join(uploadFolder, job.uuid, 'scoper.log')
  const fileStream = fs.createReadStream(scoperLogFile)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (line.includes('Adding hydrogens')) {
      scoper.reduce = 'end'
    } else if (line.includes('Running rnaview on input pdb')) {
      scoper.rnaview = 'end'
    } else if (line.match(/Running KGS with (\d+) samples/)) {
      const match = line.match(/Running KGS with (\d+) samples/)
      scoper.kgs = 'start'
      scoper.kgsConformations = match ? parseInt(match[1], 10) : 0
    } else if (line.match(/Getting FoXS scores for (\d+) structures/)) {
      scoper.foxs = 'start'
    } else if (line.match(/top_k_pdbs: \[\('(.+\.pdb)', (\d+\.\d+)\)\]/)) {
      const match = line.match(/top_k_pdbs: \[\('(.+\.pdb)', (\d+\.\d+)\)\]/)
      if (match) {
        scoper.foxs = 'end'
        scoper.foxsTopFile = match[1]
        scoper.foxsTopScore = parseFloat(match[2])
      }
    } else if (line.includes('Finished creating raw features')) {
      scoper.createdFeatures = true
    } else if (line.includes('Predicting with a threshold value of')) {
      const match = line.match(/Predicting with a threshold value of (\d+\.\d+)/)
      if (match) {
        scoper.predictionThreshold = parseFloat(match[1])
      }
    } else if (line.includes('Running MultiFoXS Combination')) {
      scoper.IonNet = 'end'
      scoper.multifoxs = 'start'
    } else if (line.includes('predicted ensemble is of size:')) {
      const match = line.match(/predicted ensemble is of size: (\d+)/)
      if (match) {
        scoper.multifoxs = 'end'
        scoper.multifoxsEnsembleSize = parseInt(match[1], 10)
      }
    } else if (line.includes('The lowest scoring ensemble is')) {
      const match = line.match(/The lowest scoring ensemble is (\d+\.\d+)/)
      if (match) {
        scoper.multifoxsScore = parseFloat(match[1])
      }
    }
  }

  // Check if the actual number of KGS files equals our expected number
  if (scoper.kgsFiles === scoper.kgsConformations) {
    scoper.kgs = 'end'
  }
  return scoper
}

const getKGSrnaProgress = async (directoryPath: string): Promise<number> => {
  try {
    const files = await fs.readdir(directoryPath)
    const pdbNumbers: number[] = files
      .filter((file) => file.startsWith('newpdb_') && file.endsWith('.pdb'))
      .map((file) => {
        const match = file.match(/newpdb_(\d+)\.pdb/)
        return match ? parseInt(match[1], 10) : 0
      })

    if (pdbNumbers.length === 0) {
      return 0 // Or -1, or any other indicator that no files were found
    }

    return Math.max(...pdbNumbers)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error reading directory:', error.message)
    } else {
      console.error('Unexpected error:', error)
    }
    throw error // Rethrow or handle as needed
  }
}

export { getScoperStatus }
