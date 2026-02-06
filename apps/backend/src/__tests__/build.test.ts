import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { describe, it, expect } from 'vitest'

describe('tsconfig.json build verification', () => {
  it('should compile TypeScript and produce dist/server.js', () => {
    // Run TypeScript compiler
    try {
      execSync('pnpm exec tsc -p .', { cwd: process.cwd(), stdio: 'inherit' })
    } catch {
      throw new Error('TypeScript compilation failed')
    }

    // Check if dist/server.js exists
    const serverJsPath = join(process.cwd(), 'dist', 'server.js')
    expect(existsSync(serverJsPath)).toBe(true)
  }, 30000) // 30 second timeout for TypeScript compilation
})
