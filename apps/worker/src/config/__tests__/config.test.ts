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
