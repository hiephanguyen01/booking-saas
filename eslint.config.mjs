import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

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
    files: ['apps/api/src/modules/*/application/**', 'apps/api/src/modules/*/domain/**'],
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
  {
    // A module's domain layer is its innermost ring: it may read `@booking/contracts`,
    // `shared/*` and its own module, but never another module's use-cases. Logic two
    // contexts genuinely share belongs in `shared/domain/*` (ADR 0003). The acyclic
    // half of that rule is enforced by the module-cycle guard in `pnpm test`.
    files: ['apps/api/src/modules/*/domain/**'],
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
            {
              group: ['../../*/application/**', '../../../*/application/**'],
              message:
                'domain không được import application của module khác — dùng chung thì đưa vào shared/domain/ (ADR 0003).',
            },
          ],
        },
      ],
    },
  },
  {
    // React Router generates `./+types/*` for one route module. Importing those
    // types anywhere else couples feature code to the route tree/typegen output.
    files: ['apps/storefront/app/**/*.{ts,tsx}', 'apps/dashboard/app/**/*.{ts,tsx}'],
    ignores: [
      'apps/storefront/app/routes/**/*.{ts,tsx}',
      'apps/dashboard/app/routes/**/*.{ts,tsx}',
      'apps/storefront/app/root.tsx',
      'apps/dashboard/app/root.tsx',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/+types/*'],
              message: 'Chỉ route module được import ./+types/*.',
            },
          ],
        },
      ],
    },
  },
  {
    // Frontend layering: reusable/domain code must not know the route tree.
    // Route modules adapt React Router args and pass data down into features.
    files: [
      'apps/storefront/app/{features,components,hooks,constants}/**/*.{ts,tsx}',
      'apps/dashboard/app/{features,components,hooks,constants}/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/routes', '~/routes/**', '**/routes', '**/routes/**'],
              message:
                'Features/components/hooks/constants không được import routes/; route module phải truyền data xuống.',
            },
            {
              group: ['**/+types/*'],
              message: 'Chỉ route module được import ./+types/*.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/storefront/app/**/*.{ts,tsx}',
      'apps/dashboard/app/**/*.{ts,tsx}',
      'packages/ui/**/*.tsx',
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Keep this non-blocking initially: changing an existing dependency array
      // can alter runtime behavior and must be reviewed separately.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
