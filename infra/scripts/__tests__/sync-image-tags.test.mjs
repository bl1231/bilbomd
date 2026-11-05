// Run with: node --test infra/scripts/__tests__/
import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  charts,
  composeFiles,
  services,
  syncChart,
  syncContent,
  syncImageTags
} from '../sync-image-tags.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('syncContent', () => {
  it('updates compose image references', () => {
    const out = syncContent(
      '    image: ghcr.io/bl1231/bilbomd-ui:2.35.4\n',
      'bilbomd-ui',
      '2.35.5'
    )
    assert.equal(out, '    image: ghcr.io/bl1231/bilbomd-ui:2.35.5\n')
  })

  it('updates helm repository/tag pairs', () => {
    const out = syncContent(
      '  image:\n    repository: ghcr.io/bl1231/bilbomd-ui\n    tag: 2.35.4\n',
      'bilbomd-ui',
      '2.35.5'
    )
    assert.match(out, /tag: 2\.35\.5\n/)
  })

  it('updates helm repositories behind a registry proxy prefix', () => {
    const out = syncContent(
      '  ui:\n    repository: harbor.bk.lbl.gov/ghcr.io/bl1231/bilbomd-ui\n    tag: 2.35.4\n',
      'bilbomd-ui',
      '2.35.5'
    )
    assert.match(out, /bilbomd-ui\n {4}tag: 2\.35\.5\n/)
  })

  it('does not touch other images that share a name prefix', () => {
    const input =
      '  ui:\n    repository: harbor.bk.lbl.gov/ghcr.io/bl1231/bilbomd-ui-extra\n    tag: 1.0.0\n'
    assert.equal(syncContent(input, 'bilbomd-ui', '2.35.5'), input)
  })

  it('does not touch third-party images', () => {
    const input =
      '  mongo:\n    repository: harbor.bk.lbl.gov/docker.io/library/mongo\n    tag: 8.3.13\n'
    assert.equal(syncContent(input, 'bilbomd-ui', '2.35.5'), input)
  })
})

describe('syncChart', () => {
  const chart = "version: 0.1.0\nappVersion: '2.35.4'\n"

  it('sets appVersion to the UI version and bumps the patch version', () => {
    assert.equal(
      syncChart(chart, '2.35.5', false),
      "version: 0.1.1\nappVersion: '2.35.5'\n"
    )
  })

  it('bumps the patch version when only values changed', () => {
    assert.equal(
      syncChart("version: 0.1.0\nappVersion: '2.35.5'\n", '2.35.5', true),
      "version: 0.1.1\nappVersion: '2.35.5'\n"
    )
  })

  it('is a no-op when already in sync', () => {
    const synced = "version: 0.1.0\nappVersion: '2.35.5'\n"
    assert.equal(syncChart(synced, '2.35.5', false), synced)
  })
})

describe('syncImageTags on a copy of the repo files', () => {
  let root

  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const read = (file) => readFileSync(join(root, file), 'utf8')

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sync-image-tags-'))
    const files = [
      ...composeFiles,
      ...charts.flatMap(({ chart, values }) => [chart, ...values]),
      ...services.map(({ app }) => `apps/${app}/package.json`)
    ]
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      cpSync(join(repoRoot, file), join(root, file))
    }
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('bumps the Berkelium chart values and Chart.yaml on a UI release', () => {
    const pkg = JSON.parse(read('apps/ui/package.json'))
    write(
      'apps/ui/package.json',
      JSON.stringify({ ...pkg, version: '9.9.9' }, null, 2)
    )
    const chartBefore = read('infra/helm-berkelium/Chart.yaml')
    const [, maj, min, patch] = chartBefore.match(/^version: (\d+)\.(\d+)\.(\d+)/m)

    assert.equal(syncImageTags({ repoRoot: root, log: () => {} }), true)

    assert.match(
      read('infra/helm-berkelium/values.yaml'),
      /repository: harbor\.bk\.lbl\.gov\/ghcr\.io\/bl1231\/bilbomd-ui\n {4}tag: 9\.9\.9\n/
    )
    const chartAfter = read('infra/helm-berkelium/Chart.yaml')
    assert.match(chartAfter, /^appVersion: '9\.9\.9'$/m)
    assert.match(
      chartAfter,
      new RegExp(`^version: ${maj}\\.${min}\\.${Number(patch) + 1}$`, 'm')
    )
    // The SPIN chart is synced in the same run.
    assert.match(read('infra/helm/Chart.yaml'), /^appVersion: '9\.9\.9'$/m)
  })

  it('is idempotent', () => {
    syncImageTags({ repoRoot: root, log: () => {} })
    const snapshot = charts.map(({ chart }) => read(chart))
    assert.equal(syncImageTags({ repoRoot: root, log: () => {} }), false)
    assert.deepEqual(
      charts.map(({ chart }) => read(chart)),
      snapshot
    )
  })
})
