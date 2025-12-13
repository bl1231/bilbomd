import fs from 'node:fs'
import path from 'node:path'

// Ensure coverage temporary directory exists to prevent ENOENT under Turbo runs.
const tmpDir = path.join(process.cwd(), 'coverage', '.tmp')
try {
  fs.mkdirSync(tmpDir, { recursive: true })
} catch {
  // noop: directory creation best-effort
}
