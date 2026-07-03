import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'tools/data/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // tsc already reports undefined identifiers; no-undef misfires on TS
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // this codebase deliberately mirrors state into refs for event handlers
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['tools/**/*.mjs', 'extensions/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    // example extension packages: executed in the app's sandbox, which injects
    // its API (app, document, console, ...) as globals
    files: ['extensions/*/main.js'],
    rules: { 'no-undef': 'off' },
  },
);
