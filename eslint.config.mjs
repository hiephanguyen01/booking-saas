import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
  {
    // NestJS DI relies on emitDecoratorMetadata: constructor-injected classes
    // must stay value imports — `import type` would erase them at runtime
    files: ['apps/api/**'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
