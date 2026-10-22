import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ['**/*.js'], extends: [jsdoc.configs['flat/recommended-error']] },
  { files: ['**/*.ts'], extends: [jsdoc.configs['flat/recommended-typescript-error']] },
  {
    rules: {
      'eqeqeq': 'error',
      'curly': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'jsdoc/require-jsdoc': ['error', {
        require: { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: true },
      }],
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
]);
