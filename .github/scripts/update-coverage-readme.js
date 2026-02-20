#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '../..')

const apps = [
  { name: 'Backend', path: 'apps/backend/coverage/coverage-summary.json' },
  { name: 'UI', path: 'apps/ui/coverage/coverage-summary.json' },
  { name: 'Worker', path: 'apps/worker/coverage/coverage-summary.json' },
  { name: 'Scoper', path: null } // No tests yet
]

const readCoverage = (path) => {
  if (!path) return null

  try {
    const fullPath = join(rootDir, path)
    const data = JSON.parse(readFileSync(fullPath, 'utf8'))
    return data.total
  } catch (error) {
    console.warn(`Warning: Could not read coverage file at ${path}:`, error.message)
    return null
  }
}

const formatPercent = (value) => {
  if (value === null || value === undefined) return 'N/A'
  return `${value.pct.toFixed(2)}%`
}

const buildCoverageTable = () => {
  const rows = apps.map((app) => {
    const coverage = readCoverage(app.path)

    if (!coverage) {
      return `| ${app.name} | N/A | N/A | N/A | N/A |`
    }

    return `| ${app.name} | ${formatPercent(coverage.statements)} | ${formatPercent(coverage.branches)} | ${formatPercent(coverage.functions)} | ${formatPercent(coverage.lines)} |`
  })

  return [
    '| App | Statements | Branches | Functions | Lines |',
    '|-----|-----------|----------|-----------|-------|',
    ...rows
  ].join('\n')
}

const updateReadme = () => {
  const readmePath = join(rootDir, 'README.md')
  const readmeContent = readFileSync(readmePath, 'utf8')

  const startMarker = '<!-- COVERAGE-TABLE:START -->'
  const endMarker = '<!-- COVERAGE-TABLE:END -->'

  const startIndex = readmeContent.indexOf(startMarker)
  const endIndex = readmeContent.indexOf(endMarker)

  if (startIndex === -1 || endIndex === -1) {
    console.error('Error: Could not find coverage table markers in README.md')
    process.exit(1)
  }

  const coverageTable = buildCoverageTable()

  const newContent =
    readmeContent.substring(0, startIndex + startMarker.length) +
    '\n' + coverageTable + '\n' +
    readmeContent.substring(endIndex)

  writeFileSync(readmePath, newContent, 'utf8')
  console.log('Successfully updated coverage in README.md')
}

updateReadme()
