import path from 'path'
import fs from 'fs-extra'
import { stringify } from 'yaml'
import { logger } from '../../../middleware/loggers.js'
import { IBioEmuEntity } from '@bilbomd/mongodb-schema'

// BioEmu2's System YAML (bioemu2.System.from_yaml): one entity per
// sequence, its copies as chain IDs, so a homodimer is one entity with
// asym_ids [A, B]. bioemu2-service reads it from <jobDir>/bioemu/system.yaml.

const CHAIN_IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// A..Z, then AA..ZZ (BioEmu2 allows chain IDs of up to 4 characters)
const chainId = (i: number): string =>
  i < CHAIN_IDS.length
    ? CHAIN_IDS[i]
    : CHAIN_IDS[Math.floor(i / CHAIN_IDS.length) - 1] +
      CHAIN_IDS[i % CHAIN_IDS.length]

const entityTypeMap: Record<string, string> = {
  Protein: 'protein',
  DNA: 'dna',
  RNA: 'rna'
}

const buildBioEmuSystem = (entities: IBioEmuEntity[]) => {
  let next = 0
  return {
    entities: entities.map((e) => ({
      entity_type: entityTypeMap[e.type] ?? 'protein',
      asym_ids: Array.from({ length: e.copies }, () => chainId(next++)),
      sequence: e.sequence,
      mods: []
    })),
    bonds: []
  }
}

const BIOEMU_SYSTEM_YAML = path.join('bioemu', 'system.yaml')

const createBioEmuSystemYaml = async (
  entities: IBioEmuEntity[],
  jobDir: string
): Promise<string> => {
  const filePath = path.join(jobDir, BIOEMU_SYSTEM_YAML)
  await fs.outputFile(filePath, stringify(buildBioEmuSystem(entities)))
  logger.info(`BioEmu2 system YAML created: ${filePath}`)
  return BIOEMU_SYSTEM_YAML
}

export {
  createBioEmuSystemYaml,
  buildBioEmuSystem,
  chainId,
  BIOEMU_SYSTEM_YAML
}
