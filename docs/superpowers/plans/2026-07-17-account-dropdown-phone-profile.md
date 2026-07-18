# Account Dropdown and Unified Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Figma nodes `2176:56060` and `2176:56546` with a route-aware account dropdown and a default unified profile/password form.

**Architecture:** Keep the existing React Router account route and authenticated BFF action. Compose the two existing Zod contracts into one account-settings contract so one `GenericForm` validates and submits all editable values; use explicit responsive grid placement to reproduce the Figma sections without adding a backend mutation.

**Tech Stack:** React 19, React Router 8 SSR, TypeScript, Tailwind CSS, `@booking/ui`, Lucide, Zod, i18next.

## Global Constraints

- Do not add test files, test configuration, test scripts, or test commands.
- Do not add an API endpoint, database schema, or persistent mutation.
- Do not embed short-lived Figma asset URLs.
- Preserve Montserrat and semantic theme tokens for tenant theming.
- Preserve authenticated loaders/actions, route navigation, Radix keyboard behavior, and server-side logout.
- Verify with formatting, lint, typecheck, build, and browser inspection only.

---

### Task 1: Combined account-settings contract

**Files:**
- Modify: `packages/contracts/src/contracts/auth.ts`

**Interfaces:**
- Consumes: `customerProfileInputSchema`, `customerPasswordChangeInputSchema`.
- Produces: `customerAccountSettingsInputSchema` and `CustomerAccountSettingsInput`.

- [ ] **Step 1: Compose the existing contracts**

Add a Zod intersection after the password-change contract:

```ts
export const customerAccountSettingsInputSchema = customerProfileInputSchema.and(
  customerPasswordChangeInputSchema,
);
export type CustomerAccountSettingsInput = z.infer<typeof customerAccountSettingsInputSchema>;
```

- [ ] **Step 2: Verify contract types**

Run: `pnpm --filter=@booking/contracts typecheck`

Expected: exit code 0 with the new exports available through the package barrel.

### Task 2: Unified Figma profile form

**Files:**
- Modify: `apps/storefront/app/routes/account/profile.tsx`

**Interfaces:**
- Consumes: `customerAccountSettingsInputSchema`, `CustomerAccountSettingsInput`, `GenericForm`, `CurrentUser` from the account outlet.
- Produces: a single JSON submission containing `fullName`, `email`, optional `phone`, `currentPassword`, `newPassword`, and `confirmPassword`.

- [ ] **Step 1: Simplify the authenticated loader and action**

Remove the query-string presentation variant. Always authenticate, parse the combined schema, and return one result shape:

```ts
type ProfileActionData = {
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
};

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  return null;
}

const parsed = customerAccountSettingsInputSchema.safeParse(value);
```

On failure return status 400 with `parsed.error.flatten().fieldErrors`; on success return `{ saved: true, error: null, fieldErrors: null }` without persistence.

- [ ] **Step 2: Configure one six-field `GenericForm`**

Use `FieldConfig<CustomerAccountSettingsInput>[]` in this exact order:

```ts
[
  { name: 'fullName', type: 'text', label: t('profile.fullName'), placeholder: t('profile.placeholder') },
  { name: 'email', type: 'email', label: t('profile.email'), placeholder: t('profile.placeholder') },
  { name: 'phone', type: 'text', label: t('profile.phone'), placeholder: t('profile.placeholder'), disabled: true },
  { name: 'currentPassword', type: 'password', label: t('profile.currentPassword'), placeholder: t('profile.placeholder') },
  { name: 'newPassword', type: 'password', label: t('profile.newPassword'), placeholder: t('profile.placeholder') },
  { name: 'confirmPassword', type: 'password', label: t('profile.confirmPassword'), placeholder: t('profile.placeholder') },
]
```

Default profile values come from `user`; password defaults are empty strings.

- [ ] **Step 3: Reproduce node `2176:56546` geometry**

Render one `AccountPanel` with `px-6 py-8 sm:px-8 lg:px-10`, a 72px avatar row, and the unified form. Use a desktop two-column grid with `375px 375px`, a `40px` column gap, and explicit grid rows so the customer ID precedes the name, the divider/password heading separates profile and password fields, and the password guidance precedes the submit row. Collapse to one column below `lg`.

Use these measurable styles:

```txt
panel: 870px target width, 40px horizontal padding, 32px vertical padding
heading: 18/28 semibold
avatar: 72px; photo button: 92x32
inputs: 375x44, 4px radius, 14/20 medium
section gap: 40px; field gap: 24px; column gap: 40px
submit: 240x48, 4px radius, 16/24 semibold
```

- [ ] **Step 4: Preserve functional details**

Keep local file preview with object URL cleanup, password visibility toggles from `FieldRenderer`, bilingual labels, merged server field errors, success status, keyboard focus, and responsive no-overflow behavior.

- [ ] **Step 5: Verify the route package**

Run: `pnpm exec prettier --check apps/storefront/app/routes/account/profile.tsx packages/contracts/src/contracts/auth.ts`

Expected: all matched files use Prettier formatting.

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0.

### Task 3: Dropdown active-review fidelity

**Files:**
- Modify only if comparison reveals a mismatch: `apps/storefront/app/layouts/site-header.tsx`

**Interfaces:**
- Consumes: `accountNavItems(locale)`, `useLocation()`, semantic tenant tokens.
- Produces: node `2176:56060` when `/account/reviews` is current.

- [ ] **Step 1: Compare the existing menu against Figma**

Confirm the root is `270×528`, the identity header is 68px, the first two rows are 44px, remaining rows are 46px, icons are 20/22px, and dividers follow reviews, recent, and help.

- [ ] **Step 2: Confirm route-aware emphasis**

Keep the current comparison:

```tsx
active={location.pathname === item.to}
```

The active review link and icon use `text-primary`; inactive labels use semantic foreground tokens. Preserve message/review badges and the message-row shadow.

- [ ] **Step 3: Verify dropdown interactions in the browser**

Confirm outside click, Escape, link selection, keyboard navigation, and logout submission remain handled by Radix and `fetcher.Form`.

### Task 4: Visual and repository verification

**Files:**
- Inspect: `apps/storefront/app/routes/account/profile.tsx`
- Inspect: `apps/storefront/app/layouts/site-header.tsx`

**Interfaces:**
- Consumes: local storefront and authenticated seeded customer session.
- Produces: measured visual evidence and clean repository checks.

- [ ] **Step 1: Inspect desktop**

At 1440px, inspect `/vi/account/profile` and `/vi/account/reviews`. Measure the profile panel/content geometry and dropdown `270×528` dimensions against the Figma screenshots.

- [ ] **Step 2: Inspect bilingual and responsive states**

Inspect `/en/account/profile`, tablet, and 390px mobile. Confirm the grid collapses, fields/buttons fit, the account Sheet remains usable, and there is no horizontal overflow.

- [ ] **Step 3: Run final checks**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `pnpm turbo lint typecheck build`

Expected: all Turbo tasks succeed; known source-map warnings may appear without failing the build.
