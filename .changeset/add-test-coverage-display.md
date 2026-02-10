---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
---

Add test coverage display to README

- Add json-summary reporter to backend and worker vitest configs
- Add json-summary reporter to UI vite config
- Create coverage update script for GitHub Actions
- Add coverage-report job to CI workflow
- Add test coverage table to README with automatic updates on main branch pushes
