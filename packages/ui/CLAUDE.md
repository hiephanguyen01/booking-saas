# packages/ui — @booking/ui (shared component library)

Local rules for the shared UI. Root context: [`../../AGENTS.md`](../../AGENTS.md).

## No build, subpath exports only

Ships **raw `.tsx`/`.ts` source** — no build step (`build` is an echo). Each consuming app compiles it,
so every app must set `ssr: { noExternal: ['@booking/ui'] }` in `vite.config.ts`. Import via subpaths:

```ts
import { Button } from '@booking/ui/components/ui/button';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { cn } from '@booking/ui/lib/utils';
```

Exports (`package.json`): `./globals.css`, `./lib/*`, `./components/*` (`.tsx`),
`./components/form/types`, `./hooks/*`. There is **no `.` entry** — the unused `src/index.ts` barrel
was deleted on 2026-07-27; always import via a subpath. A new plain-`.ts` component needs an
explicit `exports` entry (`.tsx` is already covered). `react`/`react-dom`/`react-router` are
peerDependencies (apps own the versions); Radix/cva/cmdk/lucide/react-hook-form etc. are regular deps
here — apps must not redeclare them.

## Tailwind v4, CSS-first — no per-app config

Theme tokens live in `src/styles/globals.css` (apps `@import '@booking/ui/globals.css'`). There is **no**
`tailwind-preset.ts` and **no** per-app `tailwind.config.ts` / `components.json` in the apps (Tailwind
v4 via `@tailwindcss/vite`; `globals.css` is the only shared base). Style with **shadcn
semantic tokens only** (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`,
`text-primary`/`bg-primary`, `ring-ring`, `destructive`) — never `text-gray-*`/`bg-white`/hardcoded
palette on a themed surface (narrow exceptions: text/scrims over a photo, universal status green).

## Adding / editing primitives

- `src/components/ui/*` are shadcn copies — **never hand-edit**; regenerate with the CLI from **this
  package**: `cd packages/ui && pnpm dlx shadcn@latest add <component>` (its `components.json` writes to
  `src/components/ui/` with `@booking/ui/*` imports). New Radix-style deps go in *this* package.json.
- Composed shared components (the form system, data-table, detail, theme) live in sibling folders
  (`src/components/{form,data-table,detail,theme}/`), not `ui/`.

## ⚠️ Form-control geometry — re-apply after any `shadcn add`

Six primitives deliberately diverge from the registry (each carries a `NOT FROM THE REGISTRY` comment).
The registry ships `h-9 px-3` (36px); we ship 44px (WCAG 2.5.8 / HIG min touch target). After
regenerating any of these, re-apply:

| File | We ship |
| --- | --- |
| `ui/input.tsx` | `h-11 px-4` |
| `ui/native-select.tsx` | `h-11 px-4` |
| `ui/select.tsx` | `data-[size=default]:h-11`, `px-4` |
| `ui/input-group.tsx` | `h-11` |
| `ui/textarea.tsx` | `min-h-28 px-4 py-3` |
| `ui/button.tsx` | adds `size="control"` (`h-11 px-4`) |

Never re-introduce a per-call-site height/radius/text-size on a form control: radius tracks `--radius`,
and `text-base md:text-sm` keeps mobile text at 16px so iOS Safari doesn't zoom on focus. A height on an
`Input`/`Select`/`Textarea`/`InputGroup` in app code is a defect; use `data-[size=sm]` for compact cases.

## Unused primitives

17 vendored shadcn primitives currently have **zero importers** — `aspect-ratio`, `bubble`,
`button-group`, `combobox`, `context-menu`, `direction`, `hover-card`, `item`, `kbd`, `marker`,
`menubar`, `message`, `message-scroller`, `navigation-menu`, `resizable`, `scroll-area`, `slider`.
They are kept on purpose as ready-to-use registry copies; don't treat them as dead code, but do check
whether one already covers your need before adding a new component. Deleting them would also orphan
the `@base-ui/react`, `@shadcn/react`, and `react-resizable-panels` dependencies.
