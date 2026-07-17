@AGENTS.md

---

# Claude Code specifics

The shared project context is in **[`AGENTS.md`](./AGENTS.md)** (imported above) — read it in full; every
rule there applies. This section adds only Claude-Code-specific notes.

> This file and `AGENTS.md` were rebuilt from the actual code on **2026-07-17**. The previous CLAUDE.md
> had drifted (it described JWT auth, wrong ports, React Router 7, a fictional outbox API, and commands
> that don't exist). If you find a fresh discrepancy, trust the code and fix the doc.

## Skills to invoke

Reach for the matching skill before writing code in that area — don't guess a convention a skill covers.

| When you're… | Invoke |
| --- | --- |
| Writing NestJS (modules, guards, pipes, DI) | `/nestjs` or `/nestjs-best-practices` |
| Designing a module / layer boundaries | `/designing-architecture` |
| Designing REST endpoints / status codes | `/designing-apis` |
| Writing Prisma queries / migrations | `/prisma-client-api`, `/prisma-cli` |
| Writing React / RR8 routes, loaders, actions | `/react-patterns`, `/react-router-framework-mode` |
| Adding a shadcn/ui component | `/shadcn` (add it to `packages/ui`, never an app) |
| Tailwind layout / styling | `/tailwind-css-patterns` |
| Visual polish / redesign direction | `/design-taste-frontend`, then `/web-design-guidelines` to check |
| Performance work | `/optimizing-performance` |
| Auth / RBAC / input-handling change | `/security-review` before merging |
| Git branches / commits / PRs | `/managing-git` |

Verify a change by running it, not by adding a test: `/run` then `/verify` (or the manual loop in
[`AGENTS.md`](./AGENTS.md) → Local run recipe). Clean up afterwards with `/simplify`; review a diff with
`/code-review`.

> Skill tables in older docs referenced skills not installed here — the list above is the accurate one.
> `.claude/skills/` vendors only a handful (react-router-framework-mode, nestjs-best-practices,
> prisma-cli, prisma-client-api, design-taste-frontend); the rest are Claude Code built-ins/environment
> skills.

## Environment gotcha

React Router 8 refuses to run on Node < 22.22.0 (it prints an "Oops" line and typegen/build/dev bail).
If a frontend `dev`/`build`/`typecheck` fails immediately, check `node -v` and switch to the `.nvmrc`
version (`nvm use`). Node 20 will not work.
