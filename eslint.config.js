import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  { ignores: ['dist/**', '.astro/**', '.wrangler/**', 'node_modules/**', 'tmp/**', 'playwright-report/**', 'test-results/**', 'worker-configuration.d.ts'] },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='href'][value.value='#']", message: 'No placeholder links.' }],
    },
  },
];
