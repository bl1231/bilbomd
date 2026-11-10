// The "Engine" shown for a job is whatever generated its conformers. For most
// pipelines that is the MD engine stored on the job (md_engine). Two pipelines
// don't use MD for that:
//   - Scoper runs KGSRNA;
//   - BilboMD BioEmu2 samples with BioEmu2. Its md_engine is OpenMM only
//     because OpenMM polishes the final ensemble members.
export const samplingEngineOverride = (
  jobType: string | undefined
): string | undefined => {
  if (jobType === 'scoper') return 'KGSRNA'
  if (jobType === 'bioemu') return 'BioEmu2'
  return undefined
}

export const engineLabel = (
  jobType: string | undefined,
  mdEngine: string | undefined
): string | undefined => samplingEngineOverride(jobType) ?? mdEngine
