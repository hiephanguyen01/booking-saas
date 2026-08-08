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

### Staging runs its own data services

Staging adds an overlay that brings Postgres and Redis up **as containers on the same box**, so no
managed instances are needed there:

```bash
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml up -d
```

The Deploy workflow selects this overlay automatically when `environment=stg`. The overlay file
must be present beside `docker-compose.deploy.yml` on the server. Production never selects it.

Production omits the overlay and points at managed instances. Application config is identical in both
— only the connection strings differ, which is the point: staging still exercises the same images,
the same migration path and the same nginx routing.

Measured with the overlay (all six containers, idle): **~380 MB**, of which Postgres ~37 MB and Redis
~12 MB. That fits a 2 GB box with room to spare.

Two things the overlay buys you beyond cost:

- Postgres runs as a **real superuser**, so the RLS migration creates `app_admin … BYPASSRLS`
  unaided — the managed-Postgres check in [`deployment-runbook.md`](./deployment-runbook.md) §0 does
  not apply to staging.
- Redis is pinned to `maxmemory-policy noeviction`. That is required, not tuning: Redis holds BullMQ's
  job and scheduler state, and any `allkeys-*` policy would silently evict queue keys under pressure,
  stopping the outbox relay and the three sweeper workers with no error. Hitting the cap fails writes
  loudly instead.

What you give up: one EBS volume, no replica, and **no managed backups**. Take a `pg_dump` on a
schedule if staging data matters to you.

## Topology

```
   internet :80/:443
          │
          ▼
   ┌─────────────────────────────────┐
   │ Caddy (compose, profile `tls`)  │   off where a cloud LB terminates instead
   │  admin.*, api.*  → explicit     │
   │  everything else → on_demand TLS│──ask──▶ nginx:8081 (one path)
   └──────────────┬──────────────────┘              └──▶ api /public/domains/tls-allowed
                  ▼ nginx:80
                      ┌──────────────────────────────┐
                      │ nginx :80  (compose)         │
                      │ routes by Host               │
                      │  admin.* → dashboard         │
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

### TLS — Caddy on-demand, one certificate per hostname

**Caddy owns public 80/443** and proxies to the compose nginx. It is the `caddy` service in
`docker-compose.deploy.yml` under the **`tls` profile** — enabled by `COMPOSE_PROFILES=tls` in the env
file. nginx then publishes on `127.0.0.1:8080` as a loopback debugging door only; Caddy reaches it as
`nginx:80` over the compose network. Cloudflare is authoritative DNS, and every record involved must
stay **DNS only** — turning on Proxied breaks both certificate issuance and the "point an A record at
the Elastic IP" instruction we give tenants.

Caddy is in compose rather than a host systemd unit so that its config ships like every other change:
the Deploy workflow syncs `docker/caddy/Caddyfile` to the box and recreates the container. A host unit
would put the config at `/etc/caddy/Caddyfile` — outside `DEPLOY_PATH`, needing sudo — and every edit
would be a manual `scp` somebody eventually forgets. Both hostnames and the ACME contact are `{$VAR}`
placeholders read from the same `.env.<env>` as the rest of the stack, so one Caddyfile serves staging
and production unchanged.

A tenant can add a custom domain from the dashboard at any moment, so a fixed certificate is not
enough: `booking.giangstudio.vn` pointed at the Elastic IP would fail at the TLS handshake and never
reach the app. Caddy's **on-demand TLS** obtains a certificate at the first handshake for a hostname
instead — no ops step, no redeploy per tenant.

What decides whether a hostname gets one is a single gate:

```
Caddy handshake for <host>
   └── GET http://nginx:8081/public/domains/tls-allowed?domain=<host>
          2xx → obtain certificate      404 → refuse
```

That endpoint answers exactly the rule the storefront already lives by — only a **verified** row in
`tenant_domains` resolves — reusing the 60s Redis host cache. Without it, anyone pointing any domain
at the Elastic IP could make us request certificates on their behalf and burn the Let's Encrypt rate
limit (50 certificates/week per registered domain, so every `*.stg.bookingos.vn` counts against
`bookingos.vn`). The `:8081` listener serves that one path; everything else on it is 404, and it is
published on the host only as `127.0.0.1:8081` so ops can curl the acceptance check. It is
deliberately not `https://api.stg.bookingos.vn`: that request would loop back through the Caddy
instance that is mid-handshake.

**No wildcard certificate is needed any more.** A tenant subdomain (`bookingstudio.stg.bookingos.vn`)
is also a verified `tenant_domains` row, so it takes the same on-demand HTTP-01 path as a custom
domain — no DNS-01, no `xcaddy` build with the Cloudflare plugin, no Cloudflare API token on the box.

Config: [`docker/caddy/Caddyfile`](../docker/caddy/Caddyfile). Install steps:
[`deployment-runbook.md`](./deployment-runbook.md) Phase 6–7.
[`docker/nginx/staging-host.conf`](../docker/nginx/staging-host.conf) is kept as the rollback path for
a box that came from host nginx + certbot — those certificates are still on disk, so stopping Caddy
and starting the host nginx restores the previous setup. Retire certbot only after Caddy has been
stable for 1–2 weeks.

**Certificates live in the `caddy_data` volume.** Deleting it means re-requesting every certificate,
which can hit the rate limit above. `docker compose down` keeps it; `down -v` does not.

## First deploy

```bash
cp .env.deploy.example .env.stg     # then fill every CHANGE_ME
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml up -d --build
```

Compose **fails fast** on a missing secret (`${VAR:?...}`) rather than starting with a dev default.
That matters because the API itself has no env validation at boot: `PAYMENTS_ENC_KEY` silently falls
back to a value published in this repo, so the compose file is what enforces it.

Then seed the tenants (settings only — no demo partners/listings):

```bash
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml run --rm \
  -e SEED_SCOPE=tenants \
  -e SEED_ADMIN_EMAIL='…' -e SEED_ADMIN_PASSWORD='…' -e SEED_OWNER_PASSWORD='…' \
  api node dist/operations/prisma/seed.js
```

See [`AGENTS.md` → Seed scopes](../AGENTS.md). Staging may instead seed the full demo data by omitting
`SEED_SCOPE`; production never should.

**The seed is not optional on an upgrade, not just a first install.** Permission keys live in a code
catalog and only reach the database through it, so a release that adds one leaves every route guarded
by that key returning 403 until the seed runs. `tenant.legal.manage` (shipped with the legal-documents
feature) is the current example. Seeding also does not invalidate the Redis permission cache, so
holders keep getting 403 until their cached entry expires — flush it if a release must take effect
immediately.

In `SEED_SCOPE=tenants` the legal-documents seeder creates the four required documents as **drafts**.
A tenant's storefront stays dark until its owner reads and publishes them — that is the intended
behaviour of the hard gate, not a failed deploy. See
[`features/legal-documents.md`](./features/legal-documents.md).

Finally bootstrap the storage bucket and default assets once:

```bash
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml run --rm \
  api node dist/operations/scripts/bootstrap-storage.js
```

For Cloudflare R2, create the bucket and connect its public custom domain in the Cloudflare
Dashboard first. The bootstrap script detects the R2 endpoint and skips `PutBucketPolicy` (which R2
does not implement), then uploads the default assets. Other S3-compatible development stores still
receive the public-read bucket policy.

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
| **App** | `all`, `api`, `frontends`, `storefront` or `dashboard`; `frontends` deploys both SSR apps without rebuilding the API |
| **Run migrations** | on by default; only applies to `api` / `all` |

Or from the CLI:

```bash
gh workflow run deploy.yml --ref feat/my-branch \
  -f environment=stg -f app=api
```

What it does:

1. Builds the selected app(s) for **linux/amd64** and pushes to GHCR, tagged `sha-<short>` plus a
   moving `stg`/`prod` tag.
2. Validates `docker/caddy/Caddyfile` with the real Caddy image, then **syncs the deploy config** to
   `DEPLOY_PATH` (§ below).
3. SSHes to the box, rewrites the selected `API_IMAGE` / `STOREFRONT_IMAGE` /
   `DASHBOARD_IMAGE` variables in that environment's env file to the immutable `sha-` tag, then
   pulls and restarts only the selected service(s).

The env file is **pinned in place** on purpose: a later manual `docker compose up -d` on the server
then runs the same image this deploy shipped, instead of silently drifting.

### What the deploy syncs, and what it never touches

The box holds no checkout, so every deploy copies these four files over — otherwise a compose or edge
change would only take effect once somebody remembered to `scp` it, and a deploy that reported success
would keep running the previous topology:

```
docker-compose.deploy.yml
docker-compose.stg-data.yml
docker/nginx/deploy.conf.template
docker/caddy/Caddyfile
```

`.env.stg` / `.env.prod` are **never** synced: they hold the runtime secrets and the image pins the
workflow rewrites in place. A new variable in `.env.deploy.example` still has to be added on the box
by hand — and compose fails fast (`${VAR:?}`) rather than starting without it.

The workflow hashes those four files and recreates `nginx` (and `caddy`, when the `tls` profile is on)
**only when the hash moved**, recording it in `.deploy-config.sha`. Forcing matters because they are
bind mounts: compose sees an identical mount path and would not restart anything, while nginx renders
its template only at container start and Caddy reads its Caddyfile only at load. Recreating on every
deploy instead would mean needless seconds of 502 on each release.

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
- **TLS on any path other than Caddy.** Caddy itself IS in the compose file, under the `tls` profile;
  what is not modelled is a load balancer terminating instead. Either way `X-Forwarded-Proto` reaches
  the apps so they still set `Secure` cookies and build https URLs — but a terminator that is not
  Caddy has to solve tenant custom domains some other way. See *TLS — Caddy on-demand* above for what
  the requirement actually is.
- **Gateway credentials** — SePay / MoMo / ZaloPay keys are **tenant-owned** and entered in
  Dashboard → Settings, encrypted at rest with `PAYMENTS_ENC_KEY`. They are never process env vars,
  because one process serves many tenants each with a different merchant account.
