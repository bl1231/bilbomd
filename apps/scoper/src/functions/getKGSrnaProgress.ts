import fs from 'fs-extra'

export const getKGSrnaProgress = async (
  directoryPath: string
): Promise<number> => {
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
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return 0 // Directory doesn't exist yet — no conformers generated
    }
    if (error instanceof Error) {
      console.error('Error reading directory:', error.message)
    } else {
      console.error('Unexpected error:', error)
    }
    throw error // Rethrow or handle as needed
  }
}
