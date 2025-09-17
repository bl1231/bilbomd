// Shared flat config for the monorepo
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// If you use React in some apps:
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// If you use vitest in apps:
import vitest from "eslint-plugin-vitest";

export default [
  // Global ignores (node_modules, dist, coverage are already auto-ignored by ESLint 9,
  // but you can add custom ones here)
  {
    ignores: ["**/dist/**", "**/build/**", "**/.turbo/**", "**/coverage/**"],
  },

  js.configs.recommended,

  // TypeScript base (no project config here; set per-app)
  ...tseslint.configs.recommended,

  // Prettier last to disable conflicting formatting rules
  prettier,

  // React base (apps that don’t use React can override/disable)
  {
    plugins: { react: reactPlugin, "react-hooks": reactHooks },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Vitest
  {
    plugins: { vitest },
    rules: {},
    settings: {},
  },
];
