import type { MwCheckEntity } from '@bilbomd/bilbomd-types'

// What a job form knows about the model before submission. Forms keep a
// File in the field once one is chosen and '' (or an example file's name)
// otherwise, so anything that is not a File means "nothing to check".
export type MwCheckInputs = {
  datFile: unknown
  qUnits?: string
  pdbFile?: unknown
  psfFile?: unknown
  entities?: { type: string; sequence: string; copies: number | string }[]
}

export type MwCheckRequest = {
  // Changes whenever the request would; used to drop stale answers
  key: string
  // Sequences are typed, files are picked: wait longer for typing to settle
  delayMs: number
  build: () => FormData
}

const FILE_DELAY_MS = 300
const SEQUENCE_DELAY_MS = 1200

const ENTITY_TYPES = ['Protein', 'DNA', 'RNA']

const fileKey = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}`

const usableEntities = (
  entities: MwCheckInputs['entities']
): MwCheckEntity[] | undefined => {
  if (!entities || entities.length === 0) return undefined
  const cleaned: MwCheckEntity[] = []
  for (const entity of entities) {
    const sequence = entity.sequence.replace(/\s+/g, '').toUpperCase()
    const copies = Number(entity.copies)
    if (
      !ENTITY_TYPES.includes(entity.type) ||
      !/^[A-Z]+$/.test(sequence) ||
      !Number.isInteger(copies) ||
      copies < 1
    ) {
      // Wait until every molecule on the form is filled in
      return undefined
    }
    cleaned.push({
      type: entity.type as MwCheckEntity['type'],
      sequence,
      copies
    })
  }
  return cleaned
}

// The request to make for the form's current inputs, or undefined when there
// is not yet both a SAXS file and a model to compare.
export const mwCheckRequest = ({
  datFile,
  qUnits = 'auto',
  pdbFile,
  psfFile,
  entities
}: MwCheckInputs): MwCheckRequest | undefined => {
  if (!(datFile instanceof File)) return undefined
  const base = `${fileKey(datFile)}|${qUnits}`
  const form = () => {
    const formData = new FormData()
    formData.append('dat_file', datFile)
    formData.append('q_units', qUnits)
    return formData
  }

  if (pdbFile instanceof File) {
    return {
      key: `${base}|pdb:${fileKey(pdbFile)}`,
      delayMs: FILE_DELAY_MS,
      build: () => {
        const formData = form()
        formData.append('pdb_file', pdbFile)
        return formData
      }
    }
  }
  if (psfFile instanceof File) {
    return {
      key: `${base}|psf:${fileKey(psfFile)}`,
      delayMs: FILE_DELAY_MS,
      build: () => {
        const formData = form()
        formData.append('psf_file', psfFile)
        return formData
      }
    }
  }
  const cleaned = usableEntities(entities)
  if (cleaned) {
    const json = JSON.stringify(cleaned)
    return {
      key: `${base}|seq:${json}`,
      delayMs: SEQUENCE_DELAY_MS,
      build: () => {
        const formData = form()
        formData.append('entities', json)
        return formData
      }
    }
  }
  return undefined
}
