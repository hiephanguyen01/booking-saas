import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Base ESLint config for the booking-saas monorepo.
 * Usage in apps/packages:
 *   import baseConfig from '@booking/config/eslint/base';
 *   export default [...baseConfig, { ... }]
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.turbo/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
