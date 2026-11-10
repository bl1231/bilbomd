// The MD engine to show for a job. Two pipelines don't sample with MD:
//   - Scoper runs KGSRNA, which is shown in the engine's place;
//   - BilboMD BioEmu2 samples with BioEmu2 and has no MD engine. Its stored
//     md_engine is OpenMM only because OpenMM polishes the final ensemble
//     members, so it isn't shown.
export const hasNoMdEngine = (jobType: string | undefined): boolean =>
  jobType === 'bioemu'

export const mdEngineFor = (
  jobType: string | undefined,
  mdEngine: string | undefined
): string | undefined => {
  if (jobType === 'scoper') return 'KGSRNA'
  if (hasNoMdEngine(jobType)) return undefined
  return mdEngine
}

// For the jobs table, where an empty cell would look like missing data
export const NO_MD_ENGINE = 'N/A'
