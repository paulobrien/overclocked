// Flat ESLint config (ESLint v9) for the Vite + React + TypeScript app, the
// Cloudflare Worker, the Node scripts, and the Playwright e2e tests. Type-aware
// linting is intentionally not enabled (no `parserOptions.project`) to keep
// `npm run lint` fast; `npm run typecheck` covers type correctness.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'docs/**',
      'node_modules/**',
      '.wrangler/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'public/data/assets/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Browser globals for the app, Node globals for the worker/scripts/tests.
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The codebase uses `any` deliberately in a few typed-interop spots
      // (Zod def-tree walking, CSS custom-property keys); these are documented
      // in SECURITY.md rather than linted away.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
