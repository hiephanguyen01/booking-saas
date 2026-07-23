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
  {
    // The `useExisting` trio pattern binds one Prisma class to two port tokens,
    // which requires registering the concrete class under its own token — an
    // escape hatch a use-case could otherwise exploit to inject the adapter
    // directly instead of the port. This rule closes it (ADR 0006).
    files: [
      'apps/api/src/modules/*/application/**',
      'apps/api/src/modules/*/domain/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/infrastructure'],
              message:
                'application/domain không được import infrastructure — chỉ đi qua port (ADR 0006).',
            },
          ],
        },
      ],
    },
  },
);
