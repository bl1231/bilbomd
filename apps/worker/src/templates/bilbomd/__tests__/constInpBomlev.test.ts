import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const templateDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

// heat and dynamics STREAM the user's constraint file. They run with
// 'bomlev -2', which turns a bad constraint command into a warning and skips
// it, so the file is streamed at 'bomlev 0' and the level restored after.
describe.each(['heat.handlebars', 'dynamics.handlebars'])('%s', (name) => {
  const lines = fs
    .readFileSync(path.join(templateDir, name), 'utf8')
    .split('\n')

  it('streams the constraint file at bomlev 0, then restores bomlev -2', () => {
    const stream = lines.indexOf('STREAM ../../{{constinp}}')
    expect(stream).toBeGreaterThan(0)
    expect(lines[stream - 1]).toBe('bomlev 0')
    expect(lines[stream + 1]).toBe('bomlev -2')
  })

  it('keeps bomlev -2 for the rest of the run', () => {
    expect(lines.filter((l) => l === 'bomlev 0')).toHaveLength(1)
    expect(lines.find((l) => l.startsWith('bomlev'))).toBe('bomlev -2')
  })
})
