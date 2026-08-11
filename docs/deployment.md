# Deployment — staging & production

Both environments run the **same containers from the same compose file**. They differ only by their
env file and the hostnames in it: if staging runs a different topology it stops being a rehearsal.

| | Staging | Production |
| --- | --- | --- |
| Compose | `docker-compose.deploy.yml` | same |
| Env file | `.env.stg` | `.env.prod` |
| Storefront | `stg.bookingos.vn`, `*.stg.bookingos.vn` (+ tenant custom domains) | `bookingos.vn`, `*.bookingos.vn` (+ tenant custom domains) |
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
the same migration path and the same Caddy routing.

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
   ┌───────────────────────────────────────────┐
   │ Caddy (compose) — THE ingress             │
   │                                           │
   │ TLS:    base, admin.*, api.* → at startup │
   │         everything else → on_demand ──ask──▶ api:3000 /public/domains/tls-allowed
   │                                           │
   │ Routes: admin.*  → dashboard              │
   │         api.*    → api                    │
   │         base, _  → storefront             │
   └──────────────┬───────────┬───────────┬────┘
                  ▼           ▼           ▼
             storefront   dashboard      api :3000
                  │           │           │
                  └───────────┴───────────┴──▶ managed Postgres + Redis + S3
```

**One proxy, not two.** Until 2026-08-08 a compose `nginx` sat behind Caddy and owned the Host
routing while Caddy owned only TLS. Caddy does both natively, so that hop is gone along with its
config language, its envsubst-at-container-start rendering, its `resolver`/`set $var` workaround for
nginx's permanent upstream-DNS caching, and the `X-Forwarded-Proto` relay that existed only because
there were two layers. What it cost, deliberately: the terminator is no longer swappable — putting a
cloud load balancer in front now means re-expressing these routes in that balancer's rule language.

The **storefront is the catch-all** on purpose. It resolves its tenant from the `Host` header against
`tenant_domains` (§6.1), so a tenant adding a custom domain must start working without an edge config
change. Naming hostnames there would make every tenant onboarding a deploy. Caddy passes the original
`Host` through untouched, which is what that resolution rests on.

Both frontends reach the API over the compose network (`INTERNAL_API_URL=http://api:3000`), never the
public URL — that is the "frontends never fetch the backend from the browser" rule (`AGENTS.md`)
holding at the infrastructure level too.

### TLS — Caddy on-demand, one certificate per hostname

**Caddy owns public 80/443** — the `caddy` service in `docker-compose.deploy.yml`, the only service
publishing a port. Cloudflare is authoritative DNS, and every record involved must stay **DNS only** —
turning on Proxied breaks both certificate issuance and the "point an A record at the Elastic IP"
instruction we give tenants.

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
   └── GET http://api:3000/public/domains/tls-allowed?domain=<host>
          2xx → obtain certificate      404 → refuse
```

That endpoint answers exactly the rule the storefront already lives by — only a **verified** row in
`tenant_domains` resolves — reusing the 60s Redis host cache. Without it, anyone pointing any domain
at the Elastic IP could make us request certificates on their behalf and burn the Let's Encrypt rate
limit (50 certificates/week per registered domain, so every `*.stg.bookingos.vn` counts against
`bookingos.vn`). Caddy reaches the API over the compose network, the same way the frontends do; it is
deliberately not `https://api.stg.bookingos.vn`, because that request would loop back through the
Caddy instance that is mid-handshake and would also depend on public DNS. The single-path
`nginx:8081` listener this used to go through existed only because Caddy once ran outside compose and
needed a published port — with Caddy inside, there is nothing to publish and nothing to restrict.

**No wildcard certificate is needed any more.** A tenant subdomain (`bookingstudio.stg.bookingos.vn`)
is also a verified `tenant_domains` row, so it takes the same on-demand HTTP-01 path as a custom
domain — no DNS-01, no `xcaddy` build with the Cloudflare plugin, no Cloudflare API token on the box.

Config: [`docker/caddy/Caddyfile`](../docker/caddy/Caddyfile) — one file, TLS and routes together.
Install steps: [`deployment-runbook.md`](./deployment-runbook.md) Phase 6–7.

**There is no host-nginx + certbot fallback any more**, and `docker/nginx/` is gone with it. That path
only ever worked while a compose nginx published `127.0.0.1:8080` for the host nginx to proxy into;
with routing inside Caddy nothing publishes that port, so the old config would have proxied into
nothing. Keeping a rollback file that cannot work is worse than having none. Rolling the edge back
means deploying an earlier commit — the workflow syncs the compose file and the Caddyfile together
from whichever ref you run it on. The certbot certificates still on the box are inert; retire the cron
whenever convenient.

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

For Cloudflare R2, create both `S3_BUCKET` and `S3_PRIVATE_BUCKET` first. Connect the public custom
domain only to `S3_BUCKET`; the private bucket stores tax evidence/certificates and must remain
private. The bootstrap script detects the R2 endpoint and skips `PutBucketPolicy` (which R2 does not
implement), then uploads the default assets. Other S3-compatible development stores still receive
the public-read policy on `S3_BUCKET` only.

Tax PDFs use conditional, write-once presigned PUTs (`If-None-Match: *`). The private bucket CORS
policy must allow `PUT`, the tenant dashboard origins, and the `Content-Type` plus `If-None-Match`
request headers. Pending uploads expire after 24 hours and the API cleanup worker removes only those
unattached staging objects. Issued and voided certificate objects are never deleted by application
code; retain the private bucket and database backups for the legally agreed retention period, and
enable provider-native versioning/object retention where the provider supports it.

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

The box holds no checkout, so every deploy copies these three files over — otherwise a compose or edge
change would only take effect once somebody remembered to `scp` it, and a deploy that reported success
would keep running the previous topology:

```
docker-compose.deploy.yml
docker-compose.stg-data.yml
docker/caddy/Caddyfile
```

`.env.stg` / `.env.prod` are **never** synced: they hold the runtime secrets and the image pins the
workflow rewrites in place. A new variable in `.env.deploy.example` still has to be added on the box
by hand — and compose fails fast (`${VAR:?}`) rather than starting without it.

The workflow hashes those three files and recreates `caddy` **only when the hash moved**, recording it
in `.deploy-config.sha`. Forcing matters because the Caddyfile is a bind mount: compose sees an
identical mount path and would not restart anything, while Caddy reads its config only at load.
Recreating on every deploy instead would mean needless seconds of 502 on each release.

That recreate also passes `--remove-orphans`, which is what retires a container whose service was
deleted from the compose file — the mechanism that clears the old `nginx` off a box deployed before
Caddy took over routing. Left alone it keeps running and holding its published ports.

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

Caddy deliberately does **not** wait for these. It has to hold 80/443 to answer ACME challenges and to
serve whichever apps are up, so gating its start on app health would take TLS down for the whole
platform whenever one app restarts. An upstream that is not listening yet is a 502 on that hostname
alone, and it self-heals — Caddy resolves upstreams per request.

## Scaling

The API hosts four background workers in-process (outbox relay, booking scheduler, notification
reminder, settlement release). All four are **BullMQ jobs on Redis**, not local timers: the schedule
lives in Redis (`upsertJobScheduler`) and the outbox relay claims rows `FOR UPDATE SKIP LOCKED`. So
`docker compose up -d --scale api=3` is safe and does not double-process — provided every replica
shares one Redis.

## What is deliberately NOT in here

- **Postgres / Redis** — managed instances. Running stateful services from this compose file would
  put production data in a container with no backup story.
- **Any ingress other than Caddy.** Caddy owns TLS *and* routing, so there is no longer a seam to put
  a load balancer into: an LB in front would have to re-express the Host routes in its own rule
  language and still solve tenant custom domains some other way. That was the accepted cost of
  dropping the second proxy — see *TLS — Caddy on-demand* above for what the requirement actually is.
- **Gateway credentials** — SePay / MoMo / ZaloPay keys are **tenant-owned** and entered in
  Dashboard → Settings, encrypted at rest with `PAYMENTS_ENC_KEY`. They are never process env vars,
  because one process serves many tenants each with a different merchant account.
