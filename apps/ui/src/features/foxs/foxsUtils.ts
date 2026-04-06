export const getEnsembleSizeLabel = (filename: string): string => {
  const match = filename.match(/multi_state_model_(\d+)_/)
  return match ? `Ens. Size ${match[1]}` : `Ens. Size ${filename}`
}
