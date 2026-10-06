import type { QUnits } from '@bilbomd/bilbomd-types'

export interface Entity {
  id: string
  name: string
  sequence: string
  type: string
  copies: number
  seq_length?: number
}

export interface NewAlphaFoldJobFormValues {
  title: string
  dat_file: string
  q_units: QUnits
  entities: Entity[]
  md_engine: 'charmm' | 'openmm'
}
