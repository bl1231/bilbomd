import type { QUnits } from '@bilbomd/bilbomd-types'

export type BilboMDAutoJobFormValues = {
  bilbomd_mode: 'auto'
  title: string
  pdb_file: File | string
  pae_file: File | string
  dat_file: File | string
  q_units: QUnits
  md_engine: 'charmm' | 'openmm'
}
