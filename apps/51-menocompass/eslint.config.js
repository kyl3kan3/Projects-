// Flat config: full TypeScript coverage via typescript-eslint (syntax + recommended
// rules, non-type-checked for speed) plus JS recommended for config files.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['node_modules/**', '.expo/**', '.expo-export/**', 'dist/**', 'web/**'] },
  {
    ...js.configs.recommended,
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable' } },
  },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts', '**/*.tsx'] })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // RN/Expo idioms: require() for assets, and repository rows come back untyped from SQLite.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
