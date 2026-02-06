export type BilboMDAutoJobFormValues = {
  bilbomd_mode: 'auto'
  title: string
  pdb_file: File | string
  pae_file: File | string
  dat_file: File | string
  md_engine: 'charmm' | 'openmm'
}
