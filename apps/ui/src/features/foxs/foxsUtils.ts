export const getEnsembleSizeLabel = (filename: string): string => {
  const match = filename.match(/multi_state_model_(\d+)_/)
  return match ? `Ens. Size ${match[1]}` : `Ens. Size ${filename}`
}

export const ensembleColors = [
  '#4e79a7', // muted blue
  '#f28e2b', // muted safety orange
  '#59a14f', // muted asparagus green
  '#e15759', // muted brick red
  '#b07aa1', // muted purple
  '#9c755f', // muted chestnut brown
  '#f1b7b1', // muted raspberry yogurt pink
  '#bab0ac', // muted middle gray
  '#bdbf20', // muted curry yellow-green
  '#76b7b2' // muted blue-teal
]

export const getUniqueColor = (index: number): string =>
  ensembleColors[index % ensembleColors.length] ?? '#4e79a7'
