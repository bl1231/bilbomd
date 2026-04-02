---
'@bilbomd/ui': patch
---

Remove eslint-plugin-react dependency. With the automatic JSX transform (`react-jsx`) and TypeScript, the plugin's rules are unnecessary — the two rules it provided (`react/react-in-jsx-scope`, `react/prop-types`) were already disabled. Hook linting is retained via eslint-plugin-react-hooks.
