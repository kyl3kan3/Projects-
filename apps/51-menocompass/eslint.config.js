// Minimal flat config: syntax-level checks on the TS sources.
// (Full expo/react lint rules arrive with eslint-config-expo in Phase-0 CI setup.)
const js = require('@eslint/js');

module.exports = [
  { ignores: ['node_modules/**', '.expo/**', 'dist/**'] },
  {
    ...js.configs.recommended,
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable' } },
  },
];
