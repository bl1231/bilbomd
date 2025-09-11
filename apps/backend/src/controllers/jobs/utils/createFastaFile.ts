import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../../middleware/loggers.js'
import { IAlphaFoldEntity } from '@bl1231/bilbomd-mongodb-schema'

const createFastaFile = async (
  entities: IAlphaFoldEntity[],
  jobDir: string,
  fastaFileName: string = 'af-entities.fasta'
) => {
  // Determine the header
  let header = ''
  if (entities.length === 1) {
    header = entities[0].copies > 1 ? '>multimer' : '>single-chain'
  } else {
    header = '>complex'
  }

  // Generate the sequence lines
  const sequenceLines = entities
    .flatMap((entity) => Array.from({ length: entity.copies }, () => entity.sequence))
    .map((sequence, idx, arr) => (idx === arr.length - 1 ? sequence : `${sequence}:`))
    .join('\n')

  // Combine the header and sequences
  const fastaContent = `${header}\n${sequenceLines}`

  // Define the path for the FASTA file
  const fastaFilePath = path.join(jobDir, fastaFileName)

  // Write the FASTA content to the file
  await fs.writeFile(fastaFilePath, fastaContent)
  logger.info(`FASTA file created: ${fastaFilePath}`)
}

export { createFastaFile }
