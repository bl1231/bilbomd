interface JobSummary {
  ensemble_size: number
}

export type JobResultsDTO = {
  summary: JobSummary | null
  classic: Record<string, unknown> | null
  auto: Record<string, unknown> | null
  alphafold: Record<string, unknown> | null
  sans: Record<string, unknown> | null
  scoper: Record<string, unknown> | null
}
