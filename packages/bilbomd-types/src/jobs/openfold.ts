export interface OpenFoldEntityDTO {
  name: string
  sequence: string
  type: 'Protein' | 'DNA' | 'RNA'
  copies: number
}
