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
  auto: 'auto',
  sans: 'sans',
  alphafold: 'af',
  scoper: 'scoper'
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
  af: {
    folder: 'af',
    files: ['example-saxs.dat', 'example-af.fasta']
  },
  auto: {
    folder: 'auto',
    files: ['example-auto-pae.json', 'example-auto.pdb', 'example-saxs.dat']
  },
  crd: {
    folder: 'crd',
    files: [
      'example-const.inp',
      'example.crd',
      'example.psf',
      'example-saxs.dat'
    ]
  },
  pdb: {
    folder: 'pdb',
    files: ['example-const.inp', 'example.pdb', 'example-saxs.dat']
  },
  sans: {
    folder: 'sans',
    files: ['example-const.inp', 'example-sans.dat', 'example-sans.pdb']
  },
  scoper: {
    folder: 'scoper',
    files: ['example-saxs.dat', 'example-rna.pdb']
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
