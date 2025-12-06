import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { describe, it, expect } from 'vitest'

describe('tsconfig.json build verification', () => {
  it('should compile TypeScript and produce dist/server.js', () => {
    // Run TypeScript compiler
    try {
      execSync('npx tsc', { cwd: process.cwd() })
    } catch (error) {
      throw new Error('TypeScript compilation failed')
    }

    // Check if dist/server.js exists
    const serverJsPath = join(process.cwd(), 'dist', 'server.js')
    expect(existsSync(serverJsPath)).toBe(true)
  })
})
