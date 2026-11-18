/**
 * Fields of a job record that describe the run, and so belong in the
 * bilbomd_job.json every results download includes. The file used to be the
 * whole record, which also handed whoever received the tarball the owner's
 * email and username, the results_token that opens a signed-in user's results
 * without logging in, and an anonymous submitter's public_id and IP hash.
 *
 * This is an allowlist, so a field added to the job schema later stays out of
 * results until someone decides it belongs here.
 */
export const RESULTS_SNAPSHOT_FIELDS = [
  // What and when
  'title',
  'uuid',
  '__t',
  'md_engine',
  'status',
  'progress',
  'steps',
  'time_submitted',
  'time_started',
  'time_completed',
  'createdAt',
  'updatedAt',
  // Inputs, by file name as uploaded
  'data_file',
  'pdb_file',
  'crd_file',
  'psf_file',
  'const_inp_file',
  'pae_file',
  'fasta_file',
  'query_json_file',
  'system_yaml_file',
  // Settings
  'conformational_sampling',
  'rg',
  'rg_min',
  'rg_max',
  'md_constraints',
  'openmm_parameters',
  'openmm_forcefield',
  'charmm_parameters',
  'd2o_fraction',
  'deuteration_fractions',
  'alphafold_entities',
  'openfold_entities',
  'bioemu_entities',
  'bioemu_parameters',
  'fixc1c2',
  // Outcome
  'feedback',
  'results'
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The job, as written to a results download's bilbomd_job.json: only the
 * fields in RESULTS_SNAPSHOT_FIELDS. Takes a mongoose document or a plain
 * object.
 */
export const resultsJobSnapshot = (job: unknown): Record<string, unknown> => {
  const plain =
    isRecord(job) && typeof job.toJSON === 'function'
      ? (job.toJSON as () => unknown)()
      : job
  if (!isRecord(plain)) return {}
  return Object.fromEntries(
    RESULTS_SNAPSHOT_FIELDS.filter((field) => plain[field] !== undefined).map(
      (field) => [field, plain[field]]
    )
  )
}
