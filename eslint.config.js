import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'public/vendor/'] },
  js.configs.recommended,
  jsdoc.configs['flat/recommended-error'],
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
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser, Handlebars: 'readonly' } },
  },
  {
    files: ['server/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
