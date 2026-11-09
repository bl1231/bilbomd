import type { OpenFoldEntity } from 'types/openfoldForm'

export type MoleculeType = OpenFoldEntity['type']

// Token-count chip colour: green up to `warn`, amber up to `max`, red above
export type TokenLimits = { warn: number; max: number }

export const OPENFOLD_TOKEN_LIMITS: TokenLimits = { warn: 4000, max: 6000 }

// Residues + nucleotides, counting copies
export const countTokens = (
  entities: { sequence?: string; copies?: number }[]
): number =>
  entities.reduce(
    (acc, entity) =>
      acc + (entity.sequence?.length || 0) * (Number(entity.copies) || 1),
    0
  )
