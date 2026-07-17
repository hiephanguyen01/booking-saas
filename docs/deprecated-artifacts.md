# Deprecated / dead artifacts

Things that exist in the repo but are **dead or unused**. They are documented here so agents don't
mistake them for live patterns or extend them. **Nothing here has been deleted** — this is a
deletion-proposal list awaiting owner sign-off. Do **not** build on any of these; if you touch adjacent
code and the owner has signed off, they're safe to remove.

| Artifact | What it is | Why it's dead | Recommendation |
| --- | --- | --- | --- |
| `packages/shared/` | A directory with only `.turbo/`, `dist/`, `node_modules/` — **no `package.json`, no `src/`** | Not a pnpm workspace member; superseded by `@booking/contracts`. Nothing imports it. | Delete the directory. |
| `@booking/query` (`packages/query`) | TanStack Query client + provider | **Zero consumers** as of 2026-07-17 — the dashboard's only use (browser-side booking fetch) was converted to a server loader, and its dep was removed. | Delete the package (and drop from any importer) unless client-side query is planned. |
| `@booking/config` (`packages/config`) | Shared tsconfig/eslint/prettier/tailwind/vite presets | **Zero consumers** — apps hand-roll their configs. Its `vite/react.ts` resolves the `~` alias relative to the config package itself, so it would mis-resolve if adopted (latent bug). | Adopt it across apps (and fix the alias) **or** delete it. |
| `@booking/auth` → `src/token.ts` | `decodeJwtPayload` / `isTokenExpired` / `getTokenSubject` | JWT helpers with **zero importers**; auth uses opaque tokens, not JWTs, so they can never decode a real session token. Only `permission.ts` (`hasScope`/`hasPermission`/`defaultAreaFor`/`allPermissions`) is live. | Delete `token.ts`. |
| `packages/ui/src/index.ts` | The `.` barrel exporting `cn` | Unused — apps import via subpaths (`@booking/ui/lib/utils`, `@booking/ui/components/*`). | Keep only if some tooling needs the `.` entry; otherwise remove. |
| `skills-lock.json` (root) | Lockfile listing 24 skill names | Only ~6 skills are actually vendored under `.agents/skills/` (5 symlinked into `.claude/skills/`). The lock is a stale superset. | Regenerate to match, or remove. |
| Stale in-code references | e.g. a migration comment pointing at a removed `rls-coverage.integration.spec.ts`; `schema.prisma` header calling the check `db:check-rls` (actual script: `check:rls`) | Left over from the no-tests migration / renames. | Fix the comments when nearby. |

## Notes

- `README.md` line ~33 ("Phase 0: demo stub" for storefront tenant resolution) is also stale —
  `tenant.server.ts` now does a real backend lookup. Not "dead", just out of date; the README is the
  owner's, so it's left as-is.
- The design spec `TONG-QUAN.md` §22 "Testing Strategy" is superseded by the no-tests policy
  ([ADR 0005](./decisions/0005-no-tests-policy.md)) but kept for historical/product context.
