#!/usr/bin/env node
// Sync in-house Docker image tags in deployment files to the versions in each
// app's package.json. The Changesets release bumps apps/<app>/package.json and
// CI builds/pushes ghcr.io/bl1231/bilbomd-<app>:<version>; this keeps the
// compose + helm files pointed at those freshly released tags without waiting
// for Renovate.
//
// Also keeps each Helm chart's Chart.yaml current: appVersion tracks the UI
// version (the user-facing version of the deployed app), and the chart patch
// version is bumped whenever this run changes that chart's content (values
// tags or appVersion) so CD tooling sees a new chart release. Template-only
// edits under a chart's templates/ still require a manual chart version bump.
//
// Image references may carry a registry/proxy prefix, e.g. the Berkelium chart
// pulls through Harbor's ghcr.io proxy cache as
// harbor.bk.lbl.gov/ghcr.io/bl1231/bilbomd-ui.
//
// Idempotent: running it when everything is already in sync changes nothing.
// Only the four changeset-driven images are touched (backend/ui/worker/scoper).
// Third-party (mongo, redis) and the non-changeset of3/colabfold service images
// are intentionally left for Renovate.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const defaultRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)

// service name (under apps/) -> ghcr image name suffix
export const services = [
  { app: 'backend', image: 'bilbomd-backend' },
  { app: 'ui', image: 'bilbomd-ui' },
  { app: 'worker', image: 'bilbomd-worker' },
  { app: 'scoper', image: 'bilbomd-scoper' }
]

// Compose files that may reference any of the in-house images.
export const composeFiles = [
  'infra/docker-compose-epyc.dev.yml',
  'infra/docker-compose-epyc.prod.yml',
  'infra/docker-compose-hyperion.dev.yml',
  'infra/docker-compose-hyperion.prod.yml'
]

// Helm charts: each Chart.yaml with the values files whose changes bump it.
export const charts = [
  {
    chart: 'infra/helm/Chart.yaml',
    values: ['infra/helm/values-dev.yaml', 'infra/helm/values-prod.yaml']
  },
  {
    chart: 'infra/helm-berkelium/Chart.yaml',
    values: ['infra/helm-berkelium/values.yaml']
  }
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Rewrite every reference to ghcr.io/bl1231/<image> in a compose or helm file.
// Both layouts are handled, and applying both transforms to any file is
// harmless.
export const syncContent = (content, image, version) => {
  const img = escapeRe(`ghcr.io/bl1231/${image}`)
  // compose: `image: [registry/]ghcr.io/bl1231/<image>:<tag>`
  let next = content.replace(
    new RegExp(`(${img}:)[^\\s"']+`, 'g'),
    `$1${version}`
  )
  // helm: `repository: [registry/]ghcr.io/bl1231/<image>` then `tag: <tag>`
  next = next.replace(
    new RegExp(
      `(repository:\\s*(?:[^\\s/]+/)*${img}\\s*\\n\\s*tag:\\s*)[^\\s#]+`,
      'g'
    ),
    `$1${version}`
  )
  return next
}

// appVersion follows the UI version; the chart patch version bumps only when
// this run changed the chart's values or appVersion, so re-runs on an already
// synced tree are no-ops (changesets/action re-runs the version script on
// every release-PR refresh, always from a fresh checkout of main).
export const syncChart = (content, uiVersion, valuesChanged) => {
  let next = content.replace(/^(appVersion:\s*).*$/m, `$1'${uiVersion}'`)
  if (next !== content || valuesChanged) {
    next = next.replace(
      /^(version:\s*)(\d+)\.(\d+)\.(\d+)\s*$/m,
      (_, prefix, major, minor, patch) =>
        `${prefix}${major}.${minor}.${Number(patch) + 1}`
    )
  }
  return next
}

const versionFor = (repoRoot, app) => {
  const pkgPath = resolve(repoRoot, 'apps', app, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.version) throw new Error(`No version field in ${pkgPath}`)
  return pkg.version
}

const syncFile = (repoRoot, file, versions, log) => {
  const path = resolve(repoRoot, file)
  const original = readFileSync(path, 'utf8')
  const updated = services.reduce(
    (acc, { image }) => syncContent(acc, image, versions[image]),
    original
  )
  if (updated === original) return false
  writeFileSync(path, updated)
  log(`updated ${file}`)
  return true
}

export const syncImageTags = ({
  repoRoot = defaultRepoRoot,
  log = console.log
} = {}) => {
  const versions = Object.fromEntries(
    services.map(({ app, image }) => [image, versionFor(repoRoot, app)])
  )

  let changedAny = false
  for (const file of composeFiles) {
    if (syncFile(repoRoot, file, versions, log)) changedAny = true
  }

  for (const { chart, values } of charts) {
    let valuesChanged = false
    for (const file of values) {
      if (syncFile(repoRoot, file, versions, log)) valuesChanged = true
    }
    const chartPath = resolve(repoRoot, chart)
    const chartOriginal = readFileSync(chartPath, 'utf8')
    const chartUpdated = syncChart(
      chartOriginal,
      versions['bilbomd-ui'],
      valuesChanged
    )
    if (chartUpdated !== chartOriginal) {
      writeFileSync(chartPath, chartUpdated)
      log(`updated ${chart}`)
    }
    if (valuesChanged || chartUpdated !== chartOriginal) changedAny = true
  }

  const summary = services
    .map(({ image }) => `${image}=${versions[image]}`)
    .join(' ')
  log(
    changedAny
      ? `Synced infra image tags: ${summary}`
      : `Infra image tags already in sync: ${summary}`
  )
  return changedAny
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  syncImageTags()
}
