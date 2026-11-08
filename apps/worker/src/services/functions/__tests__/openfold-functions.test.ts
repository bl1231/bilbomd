import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('../mongo-utils.js', () => ({ updateStepStatus: vi.fn() }))
vi.mock('../job-utils.js', () => ({ handleError: vi.fn() }))
vi.mock('../../../config/config.js', () => ({ config: {} }))

const { buildRunnerYml } = await import('../openfold-functions.js')

describe('buildRunnerYml', () => {
  it('leaves the MSA server at the OF3 default when no URL is configured', () => {
    const yml = buildRunnerYml(undefined)
    expect(yml).toBe('output_writer_settings:\n  structure_format: pdb\n')
    expect(yml).not.toContain('msa_computation_settings')
  })

  it('treats an empty URL as unset', () => {
    expect(buildRunnerYml('')).not.toContain('msa_computation_settings')
  })

  it('points OF3 at the configured MSA server', () => {
    const yml = buildRunnerYml('http://msa-service:8080')
    expect(yml).toBe(
      'output_writer_settings:\n' +
        '  structure_format: pdb\n' +
        'msa_computation_settings:\n' +
        '  server_url: "http://msa-service:8080"\n'
    )
  })
})
