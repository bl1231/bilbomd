# @bilbomd/md-utils

## 1.1.17

### Patch Changes

- 005482b: Update dependencies to latest within range: bullmq, mongoose, nodemailer, date-fns, react-router, type-fest, eslint, lint-staged, and turbo. ioredis intentionally kept pinned at 5.10.1 to match BullMQ's exact ioredis dependency.
- Updated dependencies [005482b]
  - @bilbomd/mongodb-schema@2.7.1

## 1.1.16

### Patch Changes

- 5c15d8a: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).
- Updated dependencies [e2d4125]
  - @bilbomd/mongodb-schema@2.7.0

## 1.1.15

### Patch Changes

- 29200d1: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).

## 1.1.14

### Patch Changes

- Updated dependencies [6a693d2]
  - @bilbomd/bilbomd-types@1.6.1

## 1.1.13

### Patch Changes

- Updated dependencies [d82f306]
  - @bilbomd/mongodb-schema@2.6.1

## 1.1.12

### Patch Changes

- c2137eb: Add BilboMD OF3 pipeline using OpenFold3 for structure prediction.

  OpenFold3 replaces ColabFold as the structure predictor and supports Protein,
  DNA, and RNA chains simultaneously. The downstream OpenMM MD + FoXS + MultiFoXS
  pipeline is identical to BilboMD AF. Input is a JSON query file; the best sample
  is selected by `sample_ranking_score` from OpenFold3 confidence outputs.

- Updated dependencies [c2137eb]
  - @bilbomd/bilbomd-types@1.6.0
  - @bilbomd/mongodb-schema@2.6.0

## 1.1.11

### Patch Changes

- e4aa0b3: Add keyword allowlist to validateInpConstraints to block CHARMM directives like 'system', 'open', 'read', etc. that could execute OS commands or perform file I/O. Mirrors the existing backend isValidConstInpFile allowlist, closing the gap on the worker-side validator. Addresses F-4 pen test finding.
- Updated dependencies [24b6dc2]
  - @bilbomd/mongodb-schema@2.5.5

## 1.1.10

### Patch Changes

- Updated dependencies [964095e]
  - @bilbomd/bilbomd-types@1.5.4

## 1.1.9

### Patch Changes

- Updated dependencies [d0504b0]
  - @bilbomd/bilbomd-types@1.5.3

## 1.1.8

### Patch Changes

- 682fd84: Fix DNA/RNA residue handling in both CHARMM and OpenMM pipelines.

  OpenMM: `minimize.py` now calls `Modeller.addHydrogens(forcefield)` after PDBFixer so that DNA/RNA residues get all required hydrogen atoms (PDBFixer alone misses some, causing a "No template found" crash at system creation).

  CHARMM: `constraintUtils.ts` segment-ID mapping now correctly handles DNA/RNA chains. `parseInpConstraints` strips the mol-type prefix (PRO/DNA/RNA/CAR/CAL) to extract the real chain ID from pdb2crd segids (e.g. `DNAD` → `D`). `generateInpFromConstraints`/`convertYamlToInp` accept an optional `chainSegidMap` built by the new `buildChainSegidMap` utility, so YAML→INP conversion emits the correct segid for each chain instead of always defaulting to `PRO{chain}`.

## 1.1.7

### Patch Changes

- 57f8495: Bump non-major npm dependencies (bullmq, vite, vitest, react-router, openid-client, prettier, typescript, and others).
- Updated dependencies [57f8495]
  - @bilbomd/mongodb-schema@2.5.4

## 1.1.6

### Patch Changes

- Updated dependencies [e24f1c6]
  - @bilbomd/mongodb-schema@2.5.3

## 1.1.5

### Patch Changes

- Updated dependencies [82d0bf4]
  - @bilbomd/mongodb-schema@2.5.2

## 1.1.4

### Patch Changes

- d9a702d: Update all dependencies. Patch/minor bumps across the board: bullmq, dotenv, mongoose, eslint, molstar, react-router, msw, vite, sass-embedded, @types/node, turbo. Bump @types/nodemailer from ^7 to ^8 to match the already-upgraded nodemailer v8 runtime.
- Updated dependencies [d9a702d]
  - @bilbomd/mongodb-schema@2.5.1

## 1.1.3

### Patch Changes

- Updated dependencies [474cef7]
  - @bilbomd/mongodb-schema@2.5.0

## 1.1.2

### Patch Changes

- 0537640: Upgrade major npm dependencies: TypeScript 6.0, Vite 8, @vitejs/plugin-react 6, jsdom 29, @types/supertest 7.
  - Update `vite.config.ts` to use `rolldownOptions` (renamed from `rollupOptions` in Vite 8)
  - Fix `vi.mock` factory JSX hoisting incompatibility introduced by @vitejs/plugin-react 6
  - Update eslint-config peer dependency to accept TypeScript 5 or 6

## 1.1.1

### Patch Changes

- cebfddb: bump nodejs to v24.13.1
- 190fe68: Update dependencies and fix ESLint preserve-caught-error rule violations by adding error cause to re-thrown errors
- Updated dependencies [cebfddb]
- Updated dependencies [624082c]
  - @bilbomd/mongodb-schema@2.4.1

## 1.1.0

### Minor Changes

- 673e173: Bump Node.js from v22 to v24

### Patch Changes

- 72f4ea4: Update dependencies.
  Improve pipeline instructions.
  Update instructions to reference OpenMM in addition to CHARMM.
- Updated dependencies [72f4ea4]
- Updated dependencies [673e173]
  - @bilbomd/mongodb-schema@2.4.0

## 1.0.20

### Patch Changes

- 1d0c4f5: Update nodejs
  Update pnpm
  Update all deps
  Fix some typescript errors that surfaced.
- Updated dependencies [1d0c4f5]
  - @bilbomd/mongodb-schema@2.3.5

## 1.0.19

### Patch Changes

- 0daf2a4: improved cicd pipeline
- Updated dependencies [0daf2a4]
  - @bilbomd/mongodb-schema@2.3.4

## 1.0.18

### Patch Changes

- 34ef235: Update all dependencies with minor or patch level bumps
- 690bed9: Update mongoose from v8 to v9.
  Split `backend` tests into unit and integration
- Updated dependencies [690bed9]
  - @bilbomd/mongodb-schema@2.3.3

## 1.0.17

### Patch Changes

- Updated dependencies [16f7879]
  - @bilbomd/mongodb-schema@2.3.2

## 1.0.16

### Patch Changes

- Updated dependencies [da97649]
  - @bilbomd/mongodb-schema@2.3.1

## 1.0.15

### Patch Changes

- Updated dependencies [5145c75]
  - @bilbomd/mongodb-schema@2.3.0

## 1.0.14

### Patch Changes

- Updated dependencies [53937de]
  - @bilbomd/mongodb-schema@2.2.0

## 1.0.13

### Patch Changes

- 1c71d30: Update npm dependencies
- Updated dependencies [1c71d30]
  - @bilbomd/mongodb-schema@2.1.2

## 1.0.12

### Patch Changes

- b107fdb: Manually trigger patch to all packages
- Updated dependencies [b107fdb]
  - @bilbomd/mongodb-schema@2.1.1

## 1.0.11

### Patch Changes

- Updated dependencies [bdc6d1d]
- Updated dependencies [2ff4c96]
  - @bilbomd/mongodb-schema@2.1.0

## 1.0.10

### Patch Changes

- a4082e0: update for CVE-2025-64756
- Updated dependencies [a4082e0]
  - @bilbomd/mongodb-schema@2.0.2

## 1.0.9

### Patch Changes

- c417040: Update all pnpm dependencies
- Updated dependencies [c417040]
  - @bilbomd/mongodb-schema@2.0.1

## 1.0.8

### Patch Changes

- Updated dependencies [f514114]
  - @bilbomd/mongodb-schema@2.0.0

## 1.0.7

### Patch Changes

- 2335ee6: Update license as per IPO
- Updated dependencies [2335ee6]
  - @bilbomd/mongodb-schema@1.12.2

## 1.0.6

### Patch Changes

- fce115a: Update nodejs and dependencies

## 1.0.5

### Patch Changes

- 578d870: Add LBL license
- Updated dependencies [578d870]
  - @bilbomd/mongodb-schema@1.12.1

## 1.0.4

### Patch Changes

- 3e2f5b4: Update pnpm and dependencies

## 1.0.3

### Patch Changes

- Updated dependencies [e110840]
  - @bilbomd/mongodb-schema@1.12.0

## 1.0.2

### Patch Changes

- Updated dependencies [9d755b6]
  - @bilbomd/mongodb-schema@1.11.0

## 1.0.1

### Patch Changes

- 1cfa2b1: Store `md_constraints` in mongodb
- 02969d1: update deps and try to sort out typescript issues
- Updated dependencies [1cfa2b1]
  - @bilbomd/mongodb-schema@1.10.0
