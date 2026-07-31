---
name: changeset
description: Create a Changesets file manually for BilboMD packages when `pnpm changeset` can't run interactively — includes the file format, semver guidance, and multi-package examples.
---

# Manual Changeset Creation

The `pnpm changeset` command is interactive and won't work in non-TTY environments (like Claude Code CLI). When this happens, create changeset files manually:

1. **Create a new file** in `.changeset/` with a descriptive kebab-case name:
   - Pattern: `.changeset/descriptive-name.md`
   - Examples: `worker-code-quality-improvements.md`, `backend-security-fixes.md`

2. **File format** (YAML front matter + description):

   ```markdown
   ---
   '@bilbomd/package-name': patch|minor|major
   ---

   Brief description of changes. Focus on user/developer impact, not implementation details.
   ```

3. **Semver guidelines**:
   - `patch` - Bug fixes, minor improvements, internal refactoring
   - `minor` - New features, significant improvements (backwards compatible)
   - `major` - Breaking changes

4. **Examples**:

   ```markdown
   ---
   '@bilbomd/worker': patch
   ---

   Improve worker reliability with graceful shutdown handling and MongoDB connection retry logic.
   ```

   ```markdown
   ---
   '@bilbomd/worker': minor
   ---

   Add comprehensive test coverage for critical infrastructure (mongo-utils, job-utils, workerControl). Extract magic numbers to centralized config/constants.ts. Consolidate error handling utilities.
   ```

5. **Multiple packages** (if changes affect multiple):

   ```markdown
   ---
   '@bilbomd/backend': patch
   '@bilbomd/mongodb-schema': patch
   ---

   Fix user authentication schema validation and update backend handlers.
   ```
