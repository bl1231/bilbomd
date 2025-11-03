import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../helpers/loggers.js'

interface AssembleEnsemblePdbFilesParams {
  numEnsembles: number
  multiFoxsDir: string
  jobDir: string
  resultsDir: string
}

const assembleEnsemblePdbFiles = async ({
  numEnsembles,
  multiFoxsDir,
  jobDir,
  resultsDir
}: AssembleEnsemblePdbFilesParams) => {
  for (let i = 1; i <= numEnsembles; i++) {
    const ensembleFile = path.join(multiFoxsDir, `ensembles_size_${i}.txt`)
    logger.info(`prepareResults ensembleFile: ${ensembleFile}`)
    const ensembleFileContent = await fs.readFile(ensembleFile, 'utf8')
    const pdbFilesRelative = extractPdbPaths(ensembleFileContent)

    const pdbFilesFullPath = pdbFilesRelative.map((item) =>
      path.isAbsolute(item) ? item : path.join(jobDir, item)
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
  }
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
  extractPdbPaths,
  concatenateAndSaveAsEnsemble,
  assembleEnsemblePdbFiles
}
