# Deployment — staging & production

Both environments run the **same containers from the same compose file**. They differ only by their
env file and the hostnames in it: if staging runs a different topology it stops being a rehearsal.

| | Staging | Production |
| --- | --- | --- |
| Compose | `docker-compose.deploy.yml` | same |
| Env file | `.env.stg` | `.env.prod` |
| Storefront | `*.stg.bookingos.vn` (+ tenant custom domains) | `*.bookingos.vn` (+ tenant custom domains) |
| Dashboard | `admin.stg.bookingos.vn` | `admin.bookingos.vn` |
| API | `api.stg.bookingos.vn` | `api.bookingos.vn` |
| Postgres / Redis | managed, outside compose | managed, outside compose |

`docker-compose.yml` at the repo root is **local dev only** (Postgres, Redis, Mailpit, MinIO). It is
never used to deploy.

## Topology

```
                      ┌──────────────────────────────┐
   TLS terminates     │ nginx :80                    │
   in front (LB /  ───▶ routes by Host               │
   Cloudflare)        │  admin.* → dashboard         │
                      │  api.*   → api               │
                      │  _       → storefront (default)
                      └──────┬───────┬───────┬───────┘
                             ▼       ▼       ▼
                        storefront dashboard api :3000
                             │       │       │
                             └───────┴───────┴──▶ managed Postgres + Redis + S3
```

The **storefront is the nginx default server** on purpose. It resolves its tenant from the `Host`
header against `tenant_domains` (§6.1), so a tenant adding a custom domain must start working without
an nginx change. Naming hostnames there would make every tenant onboarding a deploy.

Both frontends reach the API over the compose network (`INTERNAL_API_URL=http://api:3000`), never the
public URL — that is the "frontends never fetch the backend from the browser" rule (`AGENTS.md`)
holding at the infrastructure level too.

## First deploy

```bash
cp .env.deploy.example .env.stg     # then fill every CHANGE_ME
docker compose --env-file .env.stg -f docker-compose.deploy.yml up -d --build
```

Compose **fails fast** on a missing secret (`${VAR:?...}`) rather than starting with a dev default.
That matters because the API itself has no env validation at boot: `PAYMENTS_ENC_KEY` silently falls
back to a value published in this repo, so the compose file is what enforces it.

Then seed the tenants (settings only — no demo partners/listings):

```bash
docker compose --env-file .env.stg -f docker-compose.deploy.yml run --rm \
  -e SEED_SCOPE=tenants -e SEED_OWNER_PASSWORD='…' \
  api node ./node_modules/ts-node/dist/bin.js --transpile-only prisma/seed.ts
```

See [`AGENTS.md` → Seed scopes](../AGENTS.md). Staging may instead seed the full demo data by omitting
`SEED_SCOPE`; production never should.

Finally create the storage bucket once:

```bash
docker compose --env-file .env.prod -f docker-compose.deploy.yml run --rm \
  api node ./node_modules/ts-node/dist/bin.js --transpile-only scripts/bootstrap-storage.ts
```

## Migrations

The `migrate` service runs `prisma migrate deploy` and exits; `api` starts only after it succeeds
(`service_completed_successfully`). It uses the **same image** as the API, so schema and code are
always on one commit — a migration job built from another tree is how environments drift.

Migrations are hand-authored and forward-only ([ADR 0004](./decisions/0004-hand-written-migrations.md)).
There is no automatic rollback: to undo, write a new migration.

> Editing an already-applied migration file breaks its `_prisma_migrations.checksum`. Never touch one
> that has shipped, even to fix a comment.

## Releasing — the Deploy workflow

`.github/workflows/deploy.yml` is **manual only** (`workflow_dispatch`). Actions → Deploy → Run
workflow, then pick:

| Choice | How |
| --- | --- |
| **Branch** | the "Use workflow from" dropdown — it is the ref that gets built, so there is no separate input |
| **Environment** | `stg` or `prod` |
| **App** | `all`, `api`, `storefront` or `dashboard` |
| **Run migrations** | on by default; only applies to `api` / `all` |

Or from the CLI:

```bash
gh workflow run deploy.yml --ref feat/my-branch \
  -f environment=stg -f app=api
```

What it does:

1. Builds the selected app(s) for **linux/amd64** and pushes to GHCR, tagged `sha-<short>` plus a
   moving `stg`/`prod` tag.
2. SSHes to the box, rewrites `API_IMAGE` / `STOREFRONT_IMAGE` / `DASHBOARD_IMAGE` in that
   environment's env file to the immutable `sha-` tag, then `pull` + `up -d`.

The env file is **pinned in place** on purpose: a later manual `docker compose up -d` on the server
then runs the same image this deploy shipped, instead of silently drifting.

### Why migrations run explicitly

The workflow calls `docker compose run --rm migrate` rather than relying on the `depends_on:
service_completed_successfully` edge. Compose treats an **already-exited** migrate container as
"completed" and skips it, which would start a new API against an un-migrated schema.

### Required setup (once)

Repository secrets:

| Secret | What |
| --- | --- |
| `DEPLOY_HOST` / `DEPLOY_USER` | SSH target |
| `DEPLOY_SSH_KEY` | private key; the public half in the box's `authorized_keys` |
| `DEPLOY_PATH` | directory on the box holding `docker-compose.deploy.yml` + `.env.stg` / `.env.prod` |
| `GHCR_PULL_TOKEN` | PAT with `read:packages` — `GITHUB_TOKEN` is not valid outside the runner, so the box needs its own |

On GitHub: **Settings → Environments → `prod` → required reviewers**. That is what turns a prod
deploy into an approval gate; the workflow's `environment:` key wires it up. `stg` runs straight
through.

On the box: the env files live there and are **never** uploaded by CI, so runtime secrets
(`PAYMENTS_ENC_KEY`, DB passwords) never pass through Actions.

### Rollback

Point the image vars at the previous `sha-` tag and bring it up:

```bash
sed -i 's|^API_IMAGE=.*|API_IMAGE=ghcr.io/<owner>/bookingos-api:sha-<previous>|' .env.prod
docker compose --env-file .env.prod -f docker-compose.deploy.yml up -d api
```

**A rollback does not revert migrations.** Migrations are forward-only; if the release included a
destructive one, restore the database instead.

### Architecture

Images are **linux/amd64**, matching an x86 host (t3/t3a) and GitHub's x86 runners, so builds are
native — no QEMU, and none wanted: emulated builds of this repo are both far slower and observably
flakier (turbo has failed mid-build under emulation while the same `--no-cache` build passed
natively).

Moving the host to Graviton (t4g) means:

- `platforms: linux/arm64` in `deploy.yml`, plus a `docker/setup-qemu-action` step — unless the
  runner is ARM too, in which case builds stay native and only `platforms` changes;
- **rebuilding and re-pushing all three images.** An amd64 image will not run on ARM, so every
  existing `sha-` tag becomes unusable and you cannot roll back across the switch.

The `cache-*` scopes carry the arch for the same reason — the two must never share layers.

### Sizing

Measured on this stack (managed Postgres/Redis, so neither is on the box):

| | Memory |
| --- | --- |
| All four containers, idle | ~322 MB |
| After 600 requests | ~376 MB |
| Peak while **building** one app | 0.9–1.1 GB |

A 2 GB box (t3.small) runs the stack comfortably. It does **not** comfortably build it: one app peaks
near 1.1 GB, and `up -d --build` adds that on top of the ~400 MB the running stack already holds.
Build in CI and let the box only `pull` — which is what the Deploy workflow does. Swap keeps a
build from being OOM-killed but on EBS it thrashes, and on a burstable instance it drains CPU
credits that the running app then needs.

Give the root volume 20–30 GB rather than the 8 GB default (the three images alone are ~1.7 GB, and
each release adds a set) and prune on a schedule:

```bash
docker image prune -af --filter until=168h
```

## Health

| Service | Endpoint | Checks |
| --- | --- | --- |
| api | `/health` | liveness |
| api | `/health/ready` | Postgres + Redis — this is the compose healthcheck |
| storefront / dashboard | `/healthz` | liveness |

nginx starts only once all three report healthy, so it never proxies to an API that cannot reach its
database.

## Scaling

The API hosts four background workers in-process (outbox relay, booking scheduler, notification
reminder, settlement release). All four are **BullMQ jobs on Redis**, not local timers: the schedule
lives in Redis (`upsertJobScheduler`) and the outbox relay claims rows `FOR UPDATE SKIP LOCKED`. So
`docker compose up -d --scale api=3` is safe and does not double-process — provided every replica
shares one Redis.

## What is deliberately NOT in here

- **Postgres / Redis** — managed instances. Running stateful services from this compose file would
  put production data in a container with no backup story.
- **TLS** — terminated by the load balancer or Cloudflare in front of nginx. nginx forwards
  `X-Forwarded-Proto` so the apps still set `Secure` cookies and build https URLs.
- **Gateway credentials** — SePay / MoMo / ZaloPay keys are **tenant-owned** and entered in
  Dashboard → Settings, encrypted at rest with `PAYMENTS_ENC_KEY`. They are never process env vars,
  because one process serves many tenants each with a different merchant account.
