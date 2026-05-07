export interface OpenFoldEntity {
  id: string
  name: string
  sequence: string
  type: 'Protein' | 'DNA' | 'RNA'
  copies: number
  seq_length?: number
}

export interface NewOpenFoldJobFormValues {
  title: string
  dat_file: string
  entities: OpenFoldEntity[]
}
