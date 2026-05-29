import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../../middleware/loggers.js'
import { IOpenFoldEntity } from '@bilbomd/mongodb-schema'

const CHAIN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const moleculeTypeMap: Record<string, string> = {
  Protein: 'protein',
  DNA: 'dna',
  RNA: 'rna'
}

const createOpenFoldQueryJson = async (
  entities: IOpenFoldEntity[],
  jobDir: string,
  queryName: string = 'openfold-query',
  fileName: string = 'of3-query.json'
): Promise<void> => {
  let chainIndex = 0

  const chains = entities.map((entity) => {
    const chainIds: string[] = []
    for (let i = 0; i < entity.copies; i++) {
      chainIds.push(CHAIN_LETTERS[chainIndex % CHAIN_LETTERS.length])
      chainIndex++
    }
    return {
      molecule_type: moleculeTypeMap[entity.type] ?? 'protein',
      chain_ids: chainIds,
      sequence: entity.sequence
    }
  })

  const queryJson = {
    queries: {
      [queryName]: { chains }
    }
  }

  const filePath = path.join(jobDir, fileName)
  await fs.writeJson(filePath, queryJson, { spaces: 2 })
  logger.info(`OpenFold3 query JSON created: ${filePath}`)
}

export { createOpenFoldQueryJson }
