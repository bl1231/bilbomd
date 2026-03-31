---
'@bilbomd/eslint-config': patch
---

Remove eslint-plugin-react and eslint-plugin-react-hooks from shared eslint-config. The shared config is only consumed by md-utils (a Node.js package), which immediately disabled all React rules anyway. React linting lives in apps/ui's own eslint config.
