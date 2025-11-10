import { Request } from 'express'
import path from 'path'
import fs from 'fs/promises'

const exampleRoot = process.env.EXAMPLE_DATA
if (!exampleRoot) {
  throw new Error('EXAMPLE_DATA env var is not set')
}
const exampleDataFolder = exampleRoot

// Mapping from bilbomd_mode to example dataset key
const modeToDataset: Record<string, string> = {
  pdb: 'pdb',
  crd_psf: 'crd',
  auto: 'auto1',
  sans: 'sans',
  alphafold: 'af-monomer'
}

type ExampleDataResult =
  | { usingExampleData: false }
  | {
      usingExampleData: true
      data_file: string
      pdb_file?: string
      crd_file?: string
      inp_file?: string
      pae_file?: string
      psf_file?: string
      // etc per bilbomd_mode
    }

const exampleConfigs: Record<
  string,
  {
    folder: string
    files: string[]
  }
> = {
  'af-complex': {
    folder: 'af-complex',
    files: ['entities.json', 'rad51c_xrcc3.afasta', 'rad51cxrcc3mod.dat']
  },
  'af-dimer': {
    folder: 'af-dimer',
    files: ['entities.json', 'xrcc4_dimer.dat', 'xrcc4_dimer.fasta']
  },
  'af-monomer': {
    folder: 'af-mono',
    files: ['entities.json', 'A_S_USP16-FL_1.dat', 'USP16-FL.fasta']
  },
  auto1: {
    folder: 'auto1',
    files: [
      'auto1-pae.json',
      'auto1.crd',
      'auto1.pdb',
      'const.inp',
      'saxs-data.dat'
    ]
  },
  auto2: {
    folder: 'auto2',
    files: [
      'auto2-pae.json',
      'auto2.crd',
      'auto2.pdb',
      'const.inp',
      'saxs-data.dat'
    ]
  },
  bigc3: {
    folder: 'big-c3befbc',
    files: [
      'c3befbc-pae.json',
      'c3befbc.dat',
      'c3befbc.pdb',
      'const_c3befbc.inp'
    ]
  },
  crd: {
    folder: 'crd',
    files: ['const.inp', 'pro_dna.crd', 'pro_dna.psf', 'saxs-data.dat']
  },
  pdb: {
    folder: 'pdb',
    files: ['const.inp', 'pro_dna.pdb', 'saxs-data.dat']
  },
  phos: {
    folder: 'phos',
    files: ['const.inp', 'phos.pdb', 'saxs-data.dat']
  },
  sans: {
    folder: 'sans',
    files: ['const.inp', 'sans-data.dat', 'sans.pdb']
  },
  sasdnf2: {
    folder: 'sasdnf2',
    files: ['const_2.inp', 'sasdnf2-pae.json', 'sasdnf2.dat', 'sasdnf2.pdb']
  },
  sca2: {
    folder: 'sca2',
    files: ['sca2-pae.json', 'sca2.pdb']
  }
}

const applyExampleDataIfRequested = async (
  req: Request,
  jobDir: string
): Promise<ExampleDataResult> => {
  const useExampleData =
    String(req.body.useExampleData ?? '').toLowerCase() === 'true'
  if (!useExampleData) return { usingExampleData: false }

  const { bilbomd_mode } = req.body

  // Get the dataset key, using mapping if available, else bilbomd_mode
  const datasetKey = modeToDataset[bilbomd_mode] || bilbomd_mode

  const config = exampleConfigs[datasetKey]
  if (!config) {
    throw new Error(
      `Unsupported bilbomd_mode: ${bilbomd_mode} (dataset: ${datasetKey})`
    )
  }

  // copy example data files into jobDir using lowercase filenames
  for (const file of config.files) {
    const srcPath = path.join(exampleDataFolder, config.folder, file)
    const lcFile = file.toLowerCase()
    const destPath = path.join(jobDir, lcFile)
    await fs.copyFile(srcPath, destPath)
  }

  // Determine result based on file extensions
  const result: Partial<
    Omit<ExampleDataResult & { usingExampleData: true }, 'usingExampleData'>
  > = {}
  for (const file of config.files) {
    const lcFile = file.toLowerCase()
    if (lcFile.endsWith('.dat')) {
      result.data_file = lcFile
    } else if (lcFile.endsWith('.pdb')) {
      result.pdb_file = lcFile
    } else if (lcFile.endsWith('.crd')) {
      result.crd_file = lcFile
    } else if (lcFile.endsWith('.psf')) {
      result.psf_file = lcFile
    } else if (lcFile.endsWith('.inp') || lcFile.endsWith('.yml')) {
      result.inp_file = lcFile
    } else if (lcFile.endsWith('-pae.json')) {
      result.pae_file = lcFile
    }
  }

  // If no data_file but there is pdb_file, use pdb_file as data_file (e.g., for sca2)
  if (!result.data_file && result.pdb_file) {
    result.data_file = result.pdb_file
  }

  return {
    usingExampleData: true,
    ...result
  } as ExampleDataResult & { usingExampleData: true }
}

export default applyExampleDataIfRequested
