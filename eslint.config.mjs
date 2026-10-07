// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/api/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md §4: no `any` unless justified. Use an eslint-disable comment with the reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'prisma/**/*.ts', 'packages/**/*.ts', 'e2e/**/*.ts', '*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // CommonJS config files (e.g. jest.config.js).
    files: ['**/*.{js,cjs}'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['apps/api/**/*.spec.ts', 'apps/api/test/**/*.ts'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // CLAUDE.md §11 / security.md §5.1: never render raw HTML.
      'react/no-danger': 'error',
      'react/jsx-no-target-blank': 'error',
    },
  },
  prettier,
);
