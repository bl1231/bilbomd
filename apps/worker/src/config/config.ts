import dotenv from 'dotenv'
dotenv.config()

const getEnvVar = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

const toBoolean = (value?: string): boolean =>
  value === 'true' || value === '1' || value?.toLowerCase() === 'yes'

const getEnvVarWithDefault = (name: string, defaultValue: string): string => {
  return process.env[name] || defaultValue
}

const parsePositiveIntEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultValue
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Environment variable ${name}="${raw}" is not a positive number`
    )
  }
  return Math.floor(parsed)
}

export const EXECUTION_BACKENDS = ['local', 'nersc', 'k8s'] as const
export type ExecutionBackend = (typeof EXECUTION_BACKENDS)[number]

// Where the worker runs BilboMD pipelines: 'local' runs them in this process
// (epyc, hyperion), 'nersc' submits them to Perlmutter through the
// Superfacility API, and 'k8s' runs each one as a Kubernetes Job in the
// worker's own namespace (Berkelium). EXECUTION_BACKEND wins; without it the
// older USE_NERSC flag still selects NERSC.
const parseExecutionBackend = (): ExecutionBackend => {
  const raw = process.env.EXECUTION_BACKEND?.trim().toLowerCase()
  if (!raw) return toBoolean(process.env.USE_NERSC) ? 'nersc' : 'local'
  if ((EXECUTION_BACKENDS as readonly string[]).includes(raw)) {
    return raw as ExecutionBackend
  }
  throw new Error(
    `Environment variable EXECUTION_BACKEND="${process.env.EXECUTION_BACKEND}" must be one of: ${EXECUTION_BACKENDS.join(', ')}`
  )
}

const executionBackend = parseExecutionBackend()

export const FOXS_GPU_MODES = ['off', 'auto'] as const
export type FoxsGpuMode = (typeof FOXS_GPU_MODES)[number]

const parseFoxsGpuMode = (): FoxsGpuMode => {
  const raw = process.env.FOXS_GPU?.trim().toLowerCase()
  if (!raw) return 'off'
  if ((FOXS_GPU_MODES as readonly string[]).includes(raw)) {
    return raw as FoxsGpuMode
  }
  throw new Error(
    `Environment variable FOXS_GPU="${process.env.FOXS_GPU}" must be one of: ${FOXS_GPU_MODES.join(', ')}`
  )
}

// Only the NERSC backend talks to the Superfacility API and generates Slurm
// scripts, so its settings aren't required anywhere else.
const NERSC_ENV_VARS = [
  'SFAPI_URL',
  'SCRIPT_DIR',
  'UPLOAD_DIR',
  'WORK_DIR',
  'PREPARE_CHARMM_SLURM_SCRIPT',
  'PREPARE_OMM_SLURM_SCRIPT',
  'CP2CFS_SCRIPT'
]

// The k8s backend has to know which image and namespace its Jobs use; the
// rest of its settings have defaults.
const K8S_ENV_VARS = ['K8S_NAMESPACE', 'K8S_JOB_IMAGE']

const validateRequiredEnvVars = (): void => {
  const required = [
    'BILBOMD_URL',
    'DATA_VOL',
    'CHARMM_TOPOLOGY',
    'CHARMM_TEMPLATES',
    'CHARMM',
    'FOXS',
    'MULTIFOXS',
    ...(executionBackend === 'nersc' ? NERSC_ENV_VARS : []),
    ...(executionBackend === 'k8s' ? K8S_ENV_VARS : [])
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }
}

// Validate required environment variables at module initialization
validateRequiredEnvVars()

export const config = {
  sendEmailNotifications: toBoolean(process.env.SEND_EMAIL_NOTIFICATIONS),
  bilbomdUrl: getEnvVar('BILBOMD_URL'),
  executionBackend,
  runOnNERSC: executionBackend === 'nersc',
  // Validated above for the NERSC backend; empty elsewhere
  nerscBaseAPI: process.env.SFAPI_URL ?? '',
  nerscScriptDir: process.env.SCRIPT_DIR ?? '',
  nerscUploadDir: process.env.UPLOAD_DIR ?? '',
  nerscWorkDir: process.env.WORK_DIR ?? '',
  uploadDir: getEnvVar('DATA_VOL'),
  charmmTopoDir: getEnvVar('CHARMM_TOPOLOGY'),
  charmmTemplateDir: getEnvVar('CHARMM_TEMPLATES'),
  charmmBin: getEnvVar('CHARMM'),
  foxBin: getEnvVar('FOXS'),
  // GPU FoXS (#1157): 'auto' runs the FoXS step in batches on the GPU when
  // one is visible and falls back to IMP's foxs (FOXS) otherwise.
  foxsGpu: {
    mode: parseFoxsGpuMode(),
    bin: getEnvVarWithDefault('FOXS_GPU_BIN', '/usr/local/bin/foxs-gpu'),
    // PDBs per foxs-gpu call: each call costs ~0.25 s of GPU setup
    batchSize: parsePositiveIntEnv('FOXS_GPU_BATCH_SIZE', 50),
    // foxs-gpu calls running at once (they share the GPU; MPS helps)
    concurrency: parsePositiveIntEnv('FOXS_GPU_CONCURRENCY', 8)
  },
  multifoxsBin: getEnvVar('MULTIFOXS'),
  openmmPythonBin: getEnvVarWithDefault(
    'OPENMM_PYTHON_BIN',
    '/opt/envs/openmm/bin/python'
  ),
  openmmMdConcurrency: parsePositiveIntEnv('OPENMM_MD_CONCURRENCY', 1),
  basePythonBin: getEnvVarWithDefault(
    'BASE_PYTHON_BIN',
    '/opt/envs/base/bin/python'
  ),
  colabfoldServiceUrl: getEnvVarWithDefault(
    'COLABFOLD_SERVICE_URL',
    'http://colabfold-service:8000'
  ),
  colabfoldTimeoutMs: parsePositiveIntEnv(
    'COLABFOLD_TIMEOUT_MS',
    60 * 60 * 1000
  ),
  of3ServiceUrl: getEnvVarWithDefault(
    'OF3_SERVICE_URL',
    'http://of3-service:8000'
  ),
  of3TimeoutMs: parsePositiveIntEnv('OF3_TIMEOUT_MS', 60 * 60 * 1000),
  // OpenMM pipelines queue PyMOL movie renders on the movie queue. Turn this
  // off where nothing should render them (e.g. a job pod on Kubernetes).
  moviesEnabled: process.env.ENABLE_MOVIES
    ? toBoolean(process.env.ENABLE_MOVIES)
    : true,
  logLevel: getEnvVarWithDefault('LOG_LEVEL', 'info'),
  // Per-process timeouts for external tools. Defaults are ~3-4x the longest
  // runs seen on production (epyc, Dec 2025 - Sep 2026) so they only catch
  // hangs; override per deployment for unusually large systems.
  processTimeouts: {
    // OpenMM minimize / heat: observed max < 1 min
    openmmSetupMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_OPENMM_SETUP_MS',
      60 * 60 * 1000
    ),
    // One OpenMM MD run (per Rg): observed max ~63 min
    openmmMdMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_OPENMM_MD_MS',
      4 * 60 * 60 * 1000
    ),
    // CHARMM minimize / heat / dcd2pdb / pdb2crd: observed max < 2 min
    charmmSetupMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_CHARMM_SETUP_MS',
      60 * 60 * 1000
    ),
    // One CHARMM dynamics run: observed max ~22 min, but few CHARMM jobs
    // remain on disk and one crd job took ~8h end to end, so be generous
    charmmMdMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_CHARMM_MD_MS',
      6 * 60 * 60 * 1000
    ),
    // One FoXS run (a single PDB, or the initial FoXS fit): seconds
    foxsMs: parsePositiveIntEnv('PROCESS_TIMEOUT_FOXS_MS', 15 * 60 * 1000),
    // MultiFoXS: observed max ~10 min
    multifoxsMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_MULTIFOXS_MS',
      2 * 60 * 60 * 1000
    ),
    // One Pepsi-SANS run (a single PDB): seconds
    pepsiSansMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_PEPSISANS_MS',
      15 * 60 * 1000
    ),
    // GA-SANS: whole SANS jobs max out at ~64 min
    gasansMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_GASANS_MS',
      2 * 60 * 60 * 1000
    ),
    // One PyMOL movie render: whole movie stage max ~32 min
    movieMs: parsePositiveIntEnv('PROCESS_TIMEOUT_MOVIE_MS', 60 * 60 * 1000),
    // Small Python helpers (feedback, rgyr/Dmax, AutoRg, pae2const,
    // pdb2crd, prep_pdb, cif_to_pdb, strip_cofactors) and ffmpeg: seconds
    helperScriptMs: parsePositiveIntEnv(
      'PROCESS_TIMEOUT_HELPER_SCRIPT_MS',
      15 * 60 * 1000
    )
  },
  scripts: {
    prepareCHARMMSlurmScript: process.env.PREPARE_CHARMM_SLURM_SCRIPT ?? '',
    prepareOMMSlurmScript: process.env.PREPARE_OMM_SLURM_SCRIPT ?? '',
    copyFromScratchToCFSScript: process.env.CP2CFS_SCRIPT ?? ''
  },
  // Settings for the k8s backend: one Kubernetes Job per BilboMD job, running
  // `node dist/run-job.js` in the worker image (see services/functions/k8s-job.ts)
  k8s: {
    namespace: process.env.K8S_NAMESPACE ?? '',
    // Image for the job pods; the same worker image and tag as the dispatcher
    jobImage: process.env.K8S_JOB_IMAGE ?? '',
    imagePullPolicy: getEnvVarWithDefault(
      'K8S_JOB_IMAGE_PULL_POLICY',
      'IfNotPresent'
    ),
    // Comma-separated imagePullSecrets for the job pods (private images)
    imagePullSecrets: (process.env.K8S_JOB_IMAGE_PULL_SECRETS ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    // Job pods get the dispatcher's environment from these
    configMapName: getEnvVarWithDefault('K8S_JOB_CONFIGMAP', 'bilbomd-config'),
    secretName: getEnvVarWithDefault('K8S_JOB_SECRET', 'bilbomd-secrets'),
    // Job directories: this PVC's subPath is mounted at DATA_VOL
    dataPvc: getEnvVarWithDefault('K8S_JOB_DATA_PVC', 'bilbomd-data'),
    dataSubPath: getEnvVarWithDefault('K8S_JOB_DATA_SUBPATH', 'uploads'),
    // UID/GID baked into the worker image; shared with the backend so both can
    // write the job directories
    runAsUser: parsePositiveIntEnv('K8S_JOB_RUN_AS_USER', 1000),
    runAsGroup: parsePositiveIntEnv('K8S_JOB_RUN_AS_GROUP', 1000),
    // Berkelium rejects containers without CPU and memory requests and limits
    resources: {
      requests: {
        cpu: getEnvVarWithDefault('K8S_JOB_CPU_REQUEST', '4'),
        memory: getEnvVarWithDefault('K8S_JOB_MEMORY_REQUEST', '8Gi')
      },
      limits: {
        cpu: getEnvVarWithDefault('K8S_JOB_CPU_LIMIT', '8'),
        memory: getEnvVarWithDefault('K8S_JOB_MEMORY_LIMIT', '16Gi')
      }
    },
    // ResourceClaimTemplate (DRA) for jobs that need a GPU
    gpuClaimTemplate: getEnvVarWithDefault(
      'K8S_GPU_CLAIM_TEMPLATE',
      'bilbomd-gpu'
    ),
    // How many BilboMD jobs may run as Kubernetes Jobs at once: the worker's
    // BullMQ concurrency, and a cluster-wide count checked before each new
    // Job (so Jobs left running by a restarted worker count too). Berkelium
    // asked for 2-4 GPUs to start with.
    maxJobs: parsePositiveIntEnv('K8S_MAX_JOBS', 2),
    // Kubernetes stops a Job that runs longer than this
    activeDeadlineSeconds: parsePositiveIntEnv(
      'K8S_JOB_DEADLINE_SECONDS',
      12 * 60 * 60
    ),
    // Finished Jobs (and their pods and logs) are removed after this
    ttlSecondsAfterFinished: parsePositiveIntEnv(
      'K8S_JOB_TTL_SECONDS',
      24 * 60 * 60
    ),
    pollIntervalMs: parsePositiveIntEnv('K8S_POLL_INTERVAL_MS', 15_000),
    // Warn when a job pod can't be scheduled (e.g. no free GPU) for this long
    pendingWarnMs: parsePositiveIntEnv('K8S_PENDING_WARN_MS', 10 * 60 * 1000),
    // Give up on a pod whose image can't be pulled after this long
    imagePullGraceMs: parsePositiveIntEnv(
      'K8S_IMAGE_PULL_GRACE_MS',
      5 * 60 * 1000
    )
  },
  bilbomd: {
    SANSEnabled: toBoolean(process.env.ENABLE_BILBOMD_SANS),
    AlphaFoldEnabled: toBoolean(process.env.ENABLE_BILBOMD_ALPHAFOLD),
    OpenFoldEnabled: toBoolean(process.env.ENABLE_BILBOMD_OPENFOLD),
    MultiEnabled: toBoolean(process.env.ENABLE_BILBOMD_MULTI),
    ScoperEnabled: toBoolean(process.env.ENABLE_BILBOMD_SCOPER)
  }
}
