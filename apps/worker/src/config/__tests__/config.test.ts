import { describe, it, expect } from 'vitest'

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
