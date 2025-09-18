# BilboMD Monorepo — Changesets HOWTO

This doc explains how we version and release individual packages/apps in the monorepo using Changesets. It covers daily workflow, commands, CI interactions, and troubleshooting.

## Why Changesets?

- Per-package versioning (backend, worker, ui, scoper, mongodb-schema bump independently).
- Changelogs are generated per package.
- Git tags like `@bilbomd/backend@1.23.0` are created automatically.
- Plays nicely with our existing Docker build workflows (semver image tags only from main).

## One-time setup (already done)

- Initialized: `.changeset/` with `config.json`.
- Two workflows:
  - Changesets – Release PR (creates/updates “Version Packages” PR if changesets exist).
  - Changesets – Apply Versions (applies version bumps & pushes tags on main).

## Daily workflow

### 1) Make code changes

Work in a feature branch as usual.

### 2) Add a changeset

From repo root:

```bash
pnpm dlx @changesets/cli changeset
```

- Select the packages you changed (space to toggle).
- Choose patch / minor / major.
- Write a short, user-focused summary.
- Tip: If several packages changed, one changeset can cover them all; or create multiple changesets for finer control.

This creates a file like `.changeset/friendly-parrots-sing.md`.

### 3) Commit & open PR

```bash
git add .
git commit -m "feat(ui): add X [changeset]"
git push
```

Create a PR. CI will run as usual; PR images are tagged like `pr-<num>`.

### 4) Merge the PR

- On merge to main, per-app workflows build & push main images (e.g., `:latest`, `:<sha>`).
- Then Changesets – Apply Versions runs:
  - bumps affected package versions,
  - updates changelogs,
  - pushes git tags (`@bilbomd/<pkg>@<version>`),
  - pushes the version-bump commit to main.

### 5) Version build (semver images)

- Because the package `package.json` changed on main, the per-app workflows may run again (based on path filters) and push semver Docker tags:
  - `ghcr.io/bl1231/bilbomd-backend:<package.json version>`
- `latest` still only on main.

## How versions are chosen

When you add a changeset, you choose:

- **patch:** bug fixes, internal changes,
- **minor:** backwards-compatible features,
- **major:** breaking changes.

You can create multiple changesets across different PRs; Changesets will accumulate them until applied on main.

## Useful commands

Create a changeset

```bash
pnpm dlx @changesets/cli changeset
```

See what would be released (locally)

```bash
pnpm dlx @changesets/cli status
```

Apply versions locally (usually CI does this)

```bash
pnpm changeset version
```

Roll back an accidental changeset file

Just delete the file under `.changeset/` and commit.

## Docker image tags (how CI maps to versions)

Our reusable `_build-and-push.yml` emits:

- On main:
  - `:<version>` (from `apps/<app>/package.json`)
  - `:latest`
  - `:<git-sha>`
- On PRs:
  - `:pr-<num>`, `:pr-<num>-<short-sha>`
- On branches (non-main):
  - `:branch-<branch>-latest`, `:branch-<branch>-<short-sha>`

Only main produces semver tags. This keeps dev/test separate from releases.

## Writing good changeset messages

A changeset file looks like:

```md
---
"@bilbomd/backend": minor
"@bilbomd/ui": patch
---

Backend: Add /v2 search with filters.
UI: Fix loading spinner when refetching jobs.
```

Guidelines:

- Keep one-line summaries per package in the body.
- Use user-facing language (what changed, why it matters).
- For majors, note the breaking change & migration.

## FAQs & tips

**Q:** I forgot to add a changeset.  
**A:** Add it in a follow-up PR. Versions only bump when changesets are applied on main.

**Q:** I only changed docs/tests—do I need a changeset?  
**A:** No, unless you want to cut a new version anyway.

**Q:** I changed internal packages (e.g., mongodb-schema) used by apps.  
**A:** Add a changeset for the internal package and any apps that need a bump (Changesets can also auto-bump dependents using `updateInternalDependencies: "patch"`—already enabled).

**Q:** Our app built twice after merging—why?  
**A:** Expected:  
1. Build from your merge commit.  
2. Build from the version bump commit (so we get the semver image tag).

**Q:** Can I do one-off manual bumps like before?  
**A:** Yes:

```bash
pnpm -F @bilbomd/backend version patch --tag-version-prefix=backend-v
git push && git push --tags
```

…but prefer changesets to keep changelogs consistent.

## Troubleshooting

- Version PR isn’t opening: Ensure there is at least one changeset file under `.changeset/`. You can also run the “Changesets – Release PR” workflow manually.
- Apply Versions didn’t push tags: Check that the workflow ran on main and had contents: write permission. Also confirm no merge conflicts blocked the version commit.
- Docker didn’t publish `:<version>`: Verify the per-app workflow triggered on the version bump commit (path filters should include the app’s `package.json`). Also confirm the metadata step has the version tag enabled only on `refs/heads/main`.

## TL;DR

1. Code changes → 

```bash
pnpm dlx @changesets/cli changeset
```

→ PR.

2. Merge → CI builds → Changesets bumps versions & tags.

3. Per-app CI tags and pushes semver Docker images from main.