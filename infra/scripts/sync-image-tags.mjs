#!/usr/bin/env node
// Sync in-house Docker image tags in deployment files to the versions in each
// app's package.json. The Changesets release bumps apps/<app>/package.json and
// CI builds/pushes ghcr.io/bl1231/bilbomd-<app>:<version>; this keeps the
// compose + helm files pointed at those freshly released tags without waiting
// for Renovate.
//
// Also keeps infra/helm/Chart.yaml current: appVersion tracks the UI version
// (the user-facing version of the deployed app), and the chart patch version is
// bumped whenever this run changes helm content (values tags or appVersion) so
// CD tooling sees a new chart release. Template-only edits under
// infra/helm/templates/ still require a manual chart version bump.
//
// Idempotent: running it when everything is already in sync changes nothing.
// Only the four changeset-driven images are touched (backend/ui/worker/scoper).
// Third-party (mongo, redis) and the non-changeset of3/colabfold service images
// are intentionally left for Renovate.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// service name (under apps/) -> ghcr image name suffix
const services = [
  { app: 'backend', image: 'bilbomd-backend' },
  { app: 'ui', image: 'bilbomd-ui' },
  { app: 'worker', image: 'bilbomd-worker' },
  { app: 'scoper', image: 'bilbomd-scoper' }
]

// Deployment files that may reference any of the in-house images. Both compose
// (inline `image: ghcr.io/...:tag`) and helm (`repository:`/`tag:` pair) layouts
// are handled, and applying both transforms to every file is harmless.
const targetFiles = [
  'infra/docker-compose-epyc.dev.yml',
  'infra/docker-compose-epyc.prod.yml',
  'infra/docker-compose-hyperion.dev.yml',
  'infra/docker-compose-hyperion.prod.yml',
  'infra/helm/values-dev.yaml',
  'infra/helm/values-prod.yaml'
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const versionFor = (app) => {
  const pkgPath = resolve(repoRoot, 'apps', app, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.version) throw new Error(`No version field in ${pkgPath}`)
  return pkg.version
}

const syncContent = (content, image, version) => {
  const img = escapeRe(`ghcr.io/bl1231/${image}`)
  // compose: `image: ghcr.io/bl1231/<image>:<tag>`
  let next = content.replace(
    new RegExp(`(${img}:)[^\\s"']+`, 'g'),
    `$1${version}`
  )
  // helm: `repository: ghcr.io/bl1231/<image>` followed by `tag: <tag>`
  next = next.replace(
    new RegExp(`(repository:\\s*${img}\\s*\\n\\s*tag:\\s*)[^\\s#]+`, 'g'),
    `$1${version}`
  )
  return next
}

const versions = Object.fromEntries(
  services.map(({ app, image }) => [image, versionFor(app)])
)

const helmValuesFiles = new Set([
  'infra/helm/values-dev.yaml',
  'infra/helm/values-prod.yaml'
])

let changedAny = false
let helmValuesChanged = false
for (const file of targetFiles) {
  const path = resolve(repoRoot, file)
  const original = readFileSync(path, 'utf8')
  let updated = original
  for (const { image } of services) {
    updated = syncContent(updated, image, versions[image])
  }
  if (updated !== original) {
    writeFileSync(path, updated)
    changedAny = true
    if (helmValuesFiles.has(file)) helmValuesChanged = true
    console.log(`updated ${file}`)
  }
}

// Sync Chart.yaml: appVersion follows the UI version; the chart patch version
// bumps only when this run changed helm content, so re-runs on an already
// synced tree are no-ops (changesets/action re-runs the version script on
// every release-PR refresh, always from a fresh checkout of main).
const chartFile = 'infra/helm/Chart.yaml'
const chartPath = resolve(repoRoot, chartFile)
const chartOriginal = readFileSync(chartPath, 'utf8')
let chartUpdated = chartOriginal.replace(
  /^(appVersion:\s*).*$/m,
  `$1'${versions['bilbomd-ui']}'`
)
if (chartUpdated !== chartOriginal || helmValuesChanged) {
  chartUpdated = chartUpdated.replace(
    /^(version:\s*)(\d+)\.(\d+)\.(\d+)\s*$/m,
    (_, prefix, major, minor, patch) =>
      `${prefix}${major}.${minor}.${Number(patch) + 1}`
  )
}
if (chartUpdated !== chartOriginal) {
  writeFileSync(chartPath, chartUpdated)
  changedAny = true
  console.log(`updated ${chartFile}`)
}

const summary = services
  .map(({ image }) => `${image}=${versions[image]}`)
  .join(' ')
console.log(
  changedAny
    ? `Synced infra image tags: ${summary}`
    : `Infra image tags already in sync: ${summary}`
)
