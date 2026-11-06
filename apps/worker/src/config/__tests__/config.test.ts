import { describe, it, expect, afterEach, vi } from 'vitest'

describe('config.ts', () => {
  it('should successfully load config when all required env vars are present', async () => {
    // Note: In a real test environment, all required env vars should be set
    // This test assumes the test environment has all required vars set
    const { config } = await import('../config.js')

    // Verify config object has expected properties
    expect(config).toHaveProperty('bilbomdUrl')
    expect(config).toHaveProperty('foxBin')
    expect(config).toHaveProperty('multifoxsBin')
    expect(config).toHaveProperty('runOnNERSC')
    expect(config).toHaveProperty('sendEmailNotifications')
    expect(config).toHaveProperty('charmmBin')
    expect(config).toHaveProperty('uploadDir')
  })

  it('should have all expected configuration properties', async () => {
    const { config } = await import('../config.js')

    // Verify all main config properties exist
    expect(config).toHaveProperty('sendEmailNotifications')
    expect(config).toHaveProperty('bilbomdUrl')
    expect(config).toHaveProperty('runOnNERSC')
    expect(config).toHaveProperty('nerscBaseAPI')
    expect(config).toHaveProperty('nerscScriptDir')
    expect(config).toHaveProperty('nerscUploadDir')
    expect(config).toHaveProperty('nerscWorkDir')
    expect(config).toHaveProperty('uploadDir')
    expect(config).toHaveProperty('charmmTopoDir')
    expect(config).toHaveProperty('charmmTemplateDir')
    expect(config).toHaveProperty('charmmBin')
    expect(config).toHaveProperty('foxBin')
    expect(config).toHaveProperty('multifoxsBin')
    expect(config).toHaveProperty('logLevel')
    expect(config).toHaveProperty('scripts')
    expect(config).toHaveProperty('bilbomd')

    // Verify nested structures
    expect(config.scripts).toHaveProperty('prepareCHARMMSlurmScript')
    expect(config.scripts).toHaveProperty('prepareOMMSlurmScript')
    expect(config.scripts).toHaveProperty('copyFromScratchToCFSScript')

    expect(config.bilbomd).toHaveProperty('SANSEnabled')
    expect(config.bilbomd).toHaveProperty('AlphaFoldEnabled')
    expect(config.bilbomd).toHaveProperty('MultiEnabled')
    expect(config.bilbomd).toHaveProperty('ScoperEnabled')
  })

  it('should have correct types for boolean configurations', async () => {
    const { config } = await import('../config.js')

    // Verify boolean types
    expect(typeof config.sendEmailNotifications).toBe('boolean')
    expect(typeof config.runOnNERSC).toBe('boolean')
    expect(typeof config.bilbomd.SANSEnabled).toBe('boolean')
    expect(typeof config.bilbomd.AlphaFoldEnabled).toBe('boolean')
    expect(typeof config.bilbomd.MultiEnabled).toBe('boolean')
    expect(typeof config.bilbomd.ScoperEnabled).toBe('boolean')
  })
})

describe('config.ts env parsing', () => {
  // These tests mutate process.env and re-import the module to exercise the
  // (non-exported) helper branches. Restore the environment after each test.
  const ENV_SNAPSHOT = { ...process.env }

  afterEach(() => {
    process.env = { ...ENV_SNAPSHOT }
    vi.resetModules()
  })

  const reimport = async () => {
    vi.resetModules()
    return import('../config.js')
  }

  describe('toBoolean', () => {
    it('treats "true", "1", and "yes" (any case) as true', async () => {
      process.env.SEND_EMAIL_NOTIFICATIONS = 'true'
      process.env.USE_NERSC = '1'
      process.env.ENABLE_BILBOMD_SANS = 'YES'
      process.env.ENABLE_BILBOMD_ALPHAFOLD = 'yes'
      const { config } = await reimport()
      expect(config.sendEmailNotifications).toBe(true)
      expect(config.runOnNERSC).toBe(true)
      expect(config.bilbomd.SANSEnabled).toBe(true)
      expect(config.bilbomd.AlphaFoldEnabled).toBe(true)
    })

    it('treats other values and undefined as false', async () => {
      process.env.SEND_EMAIL_NOTIFICATIONS = 'no'
      delete process.env.USE_NERSC
      const { config } = await reimport()
      expect(config.sendEmailNotifications).toBe(false)
      expect(config.runOnNERSC).toBe(false)
    })
  })

  describe('getEnvVarWithDefault', () => {
    it('uses the provided value when the env var is set', async () => {
      process.env.LOG_LEVEL = 'debug'
      process.env.OPENMM_PYTHON_BIN = '/custom/python'
      const { config } = await reimport()
      expect(config.logLevel).toBe('debug')
      expect(config.openmmPythonBin).toBe('/custom/python')
    })

    it('falls back to the default when the env var is unset', async () => {
      delete process.env.LOG_LEVEL
      delete process.env.OPENMM_PYTHON_BIN
      const { config } = await reimport()
      expect(config.logLevel).toBe('info')
      expect(config.openmmPythonBin).toBe('/opt/envs/openmm/bin/python')
    })
  })

  describe('parsePositiveIntEnv', () => {
    it('parses a valid positive integer and floors it', async () => {
      process.env.OPENMM_MD_CONCURRENCY = '4.9'
      const { config } = await reimport()
      expect(config.openmmMdConcurrency).toBe(4)
    })

    it('returns the default when unset or empty', async () => {
      delete process.env.OPENMM_MD_CONCURRENCY
      process.env.COLABFOLD_TIMEOUT_MS = ''
      const { config } = await reimport()
      expect(config.openmmMdConcurrency).toBe(1)
      expect(config.colabfoldTimeoutMs).toBe(60 * 60 * 1000)
    })

    it('throws on a non-numeric value', async () => {
      process.env.OPENMM_MD_CONCURRENCY = 'abc'
      await expect(reimport()).rejects.toThrow(/is not a positive number/)
    })

    it('throws on a non-positive value', async () => {
      process.env.OPENMM_MD_CONCURRENCY = '-1'
      await expect(reimport()).rejects.toThrow(/is not a positive number/)
    })
  })

  describe('processTimeouts', () => {
    it('defaults to 1h for OpenMM setup and 4h per OpenMM MD run', async () => {
      delete process.env.PROCESS_TIMEOUT_OPENMM_SETUP_MS
      delete process.env.PROCESS_TIMEOUT_OPENMM_MD_MS
      const { config } = await reimport()
      expect(config.processTimeouts.openmmSetupMs).toBe(60 * 60 * 1000)
      expect(config.processTimeouts.openmmMdMs).toBe(4 * 60 * 60 * 1000)
    })

    it('can be overridden per deployment', async () => {
      process.env.PROCESS_TIMEOUT_OPENMM_MD_MS = '28800000'
      const { config } = await reimport()
      expect(config.processTimeouts.openmmMdMs).toBe(8 * 60 * 60 * 1000)
    })

    it('rejects invalid overrides', async () => {
      process.env.PROCESS_TIMEOUT_OPENMM_SETUP_MS = '0'
      await expect(reimport()).rejects.toThrow(
        /PROCESS_TIMEOUT_OPENMM_SETUP_MS.*is not a positive number/
      )
    })
  })

  describe('executionBackend', () => {
    it('defaults to local', async () => {
      delete process.env.EXECUTION_BACKEND
      delete process.env.USE_NERSC
      const { config } = await reimport()
      expect(config.executionBackend).toBe('local')
      expect(config.runOnNERSC).toBe(false)
    })

    it('falls back to USE_NERSC when EXECUTION_BACKEND is unset', async () => {
      delete process.env.EXECUTION_BACKEND
      process.env.USE_NERSC = 'true'
      const { config } = await reimport()
      expect(config.executionBackend).toBe('nersc')
      expect(config.runOnNERSC).toBe(true)
    })

    it('prefers EXECUTION_BACKEND over USE_NERSC', async () => {
      process.env.EXECUTION_BACKEND = 'local'
      process.env.USE_NERSC = 'true'
      const { config } = await reimport()
      expect(config.executionBackend).toBe('local')
      expect(config.runOnNERSC).toBe(false)
    })

    it('ignores case and surrounding whitespace', async () => {
      process.env.EXECUTION_BACKEND = ' NERSC '
      const { config } = await reimport()
      expect(config.executionBackend).toBe('nersc')
      expect(config.runOnNERSC).toBe(true)
    })

    it('rejects an unknown backend', async () => {
      process.env.EXECUTION_BACKEND = 'slurm'
      await expect(reimport()).rejects.toThrow(
        /EXECUTION_BACKEND="slurm" must be one of: local, nersc, k8s/
      )
    })
  })

  describe('foxsGpu', () => {
    it('is off by default, with batch and concurrency defaults', async () => {
      delete process.env.FOXS_GPU
      delete process.env.FOXS_GPU_BIN
      delete process.env.FOXS_GPU_BATCH_SIZE
      delete process.env.FOXS_GPU_CONCURRENCY
      const { config } = await reimport()
      expect(config.foxsGpu).toEqual({
        mode: 'off',
        bin: '/usr/local/bin/foxs-gpu',
        batchSize: 50,
        concurrency: 8
      })
    })

    it('reads auto mode and overrides, ignoring case', async () => {
      process.env.FOXS_GPU = ' Auto '
      process.env.FOXS_GPU_BIN = '/opt/foxs-gpu'
      process.env.FOXS_GPU_BATCH_SIZE = '25'
      process.env.FOXS_GPU_CONCURRENCY = '4'
      const { config } = await reimport()
      expect(config.foxsGpu).toEqual({
        mode: 'auto',
        bin: '/opt/foxs-gpu',
        batchSize: 25,
        concurrency: 4
      })
    })

    it('rejects an unknown mode', async () => {
      process.env.FOXS_GPU = 'on'
      await expect(reimport()).rejects.toThrow(/FOXS_GPU="on" must be one of/)
    })
  })

  describe('k8s settings', () => {
    it('require a namespace and job image on the k8s backend', async () => {
      process.env.EXECUTION_BACKEND = 'k8s'
      delete process.env.K8S_NAMESPACE
      delete process.env.K8S_JOB_IMAGE
      await expect(reimport()).rejects.toThrow(
        /Missing required environment variables:.*K8S_NAMESPACE.*K8S_JOB_IMAGE/
      )
    })

    it('are optional on other backends', async () => {
      process.env.EXECUTION_BACKEND = 'local'
      delete process.env.K8S_NAMESPACE
      delete process.env.K8S_JOB_IMAGE
      const { config } = await reimport()
      expect(config.k8s.namespace).toBe('')
      expect(config.k8s.jobImage).toBe('')
    })

    it('have defaults for everything else', async () => {
      process.env.EXECUTION_BACKEND = 'k8s'
      process.env.K8S_NAMESPACE = 'bilbomd'
      process.env.K8S_JOB_IMAGE = 'worker:1'
      const { config } = await reimport()
      expect(config.executionBackend).toBe('k8s')
      expect(config.runOnNERSC).toBe(false)
      expect(config.k8s).toMatchObject({
        namespace: 'bilbomd',
        jobImage: 'worker:1',
        configMapName: 'bilbomd-config',
        secretName: 'bilbomd-secrets',
        dataPvc: 'bilbomd-data',
        dataSubPath: 'uploads',
        gpuClaimTemplate: 'bilbomd-gpu',
        maxJobs: 2,
        activeDeadlineSeconds: 12 * 60 * 60,
        resources: {
          requests: { cpu: '4', memory: '8Gi' },
          limits: { cpu: '8', memory: '16Gi' }
        }
      })
    })

    it('can be overridden', async () => {
      process.env.EXECUTION_BACKEND = 'k8s'
      process.env.K8S_NAMESPACE = 'bilbomd'
      process.env.K8S_JOB_IMAGE = 'worker:1'
      process.env.K8S_MAX_JOBS = '4'
      process.env.K8S_JOB_MEMORY_LIMIT = '32Gi'
      process.env.K8S_JOB_RUN_AS_USER = '62704'
      const { config } = await reimport()
      expect(config.k8s.maxJobs).toBe(4)
      expect(config.k8s.resources.limits.memory).toBe('32Gi')
      expect(config.k8s.runAsUser).toBe(62704)
    })
  })

  describe('NERSC settings', () => {
    const NERSC_VARS = [
      'SFAPI_URL',
      'SCRIPT_DIR',
      'UPLOAD_DIR',
      'WORK_DIR',
      'PREPARE_CHARMM_SLURM_SCRIPT',
      'PREPARE_OMM_SLURM_SCRIPT',
      'CP2CFS_SCRIPT'
    ]

    it('are optional for the local backend', async () => {
      process.env.EXECUTION_BACKEND = 'local'
      for (const name of NERSC_VARS) delete process.env[name]
      const { config } = await reimport()
      expect(config.nerscBaseAPI).toBe('')
      expect(config.nerscWorkDir).toBe('')
      expect(config.scripts.copyFromScratchToCFSScript).toBe('')
    })

    it('are required for the NERSC backend', async () => {
      process.env.EXECUTION_BACKEND = 'nersc'
      delete process.env.SFAPI_URL
      delete process.env.CP2CFS_SCRIPT
      await expect(reimport()).rejects.toThrow(
        /Missing required environment variables:.*SFAPI_URL.*CP2CFS_SCRIPT/
      )
    })
  })

  describe('moviesEnabled', () => {
    it('defaults to true', async () => {
      delete process.env.ENABLE_MOVIES
      const { config } = await reimport()
      expect(config.moviesEnabled).toBe(true)
    })

    it('can be turned off', async () => {
      process.env.ENABLE_MOVIES = 'false'
      const { config } = await reimport()
      expect(config.moviesEnabled).toBe(false)
    })
  })

  describe('validateRequiredEnvVars', () => {
    it('throws listing the missing required variables', async () => {
      delete process.env.BILBOMD_URL
      delete process.env.CHARMM
      await expect(reimport()).rejects.toThrow(
        /Missing required environment variables:.*BILBOMD_URL.*CHARMM/
      )
    })
  })
})
