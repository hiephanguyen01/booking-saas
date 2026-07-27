# Deploy runbook — from zero to staging

A step-by-step first deploy for someone new to AWS. It assumes the stack described in
[`deployment.md`](./deployment.md) (that doc is the reference; this one is the sequence).

Target: **AWS EC2 t3.small** running the containers, **managed Postgres + Redis**, **Cloudflare R2**
for storage, **Resend** for mail. Tenant custom domains via Cloudflare come **last** (§10) — deliberately,
because nothing else depends on them and they are the fiddliest part.

Do staging end-to-end first. Production is the same sequence with `prod` substituted everywhere.

---

> **Staging shortcut.** Sections 2 and 3 provision managed Postgres and Redis. For staging you can
> skip both and run them as containers on the same EC2 box with
> `-f docker-compose.stg-data.yml` (see [`deployment.md`](./deployment.md) → *Staging runs its own
> data services*). That removes RDS and ElastiCache from the bill — roughly $43/mo → $16/mo at
> 12h/day — and §0 below stops applying, because a containerised Postgres runs as a real superuser.
> Production still follows §2 and §3.

## 0. Before you touch anything: the one check that can stop the project

The RLS migration creates a database role with the `BYPASSRLS` attribute, and PostgreSQL only lets a
role that *has* `BYPASSRLS` create another one:

```
ERROR:  permission denied to create role
DETAIL:  Only roles with the BYPASSRLS attribute may create roles with the BYPASSRLS attribute.
```

Managed Postgres often gives you a powerful-but-not-superuser master account. **Test yours before
building anything else.** Connect as the master user and run:

```sql
CREATE ROLE bypassrls_probe LOGIN PASSWORD 'x' BYPASSRLS;
DROP ROLE bypassrls_probe;
```

- **Succeeds** → carry on, nothing to change.
- **Fails** → your provider cannot host this schema as-is. `app_admin` needs `BYPASSRLS` for the
  cross-tenant paths (webhooks, reconciliation, platform health) to read past RLS. Options: a
  provider that grants real superuser (self-managed Postgres on EC2, or some DBaaS), or an
  architecture change. This is not a config tweak — resolve it now, not after the EC2 box exists.

---

## 1. Domains you will need

Decide these up front; several later steps bake them in.

| Purpose | Staging | Production |
| --- | --- | --- |
| API | `api.stg.bookingos.vn` | `api.bookingos.vn` |
| Dashboard | `admin.stg.bookingos.vn` | `admin.bookingos.vn` |
| Tenant storefronts | `<slug>.stg.bookingos.vn` | `<slug>.bookingos.vn` |
| Object storage (public reads) | `cdn.stg.bookingos.vn` | `cdn.bookingos.vn` |

---

## 2. Postgres

Create a managed PostgreSQL **16** instance. `db.t4g.micro` is enough for staging.

1. Put it in the **same VPC** as the EC2 box; do **not** make it publicly accessible.
2. Security group: allow inbound `5432` **only** from the EC2 instance's security group.
3. Create the database (e.g. `bookingos`).
4. Run §0's probe if you have not already.
5. Pre-create the two application roles with **real** passwords. The migration only creates them
   `IF NOT EXISTS`, so doing this first means it will not install its documented dev passwords:

   ```sql
   CREATE ROLE app_user  LOGIN PASSWORD '<strong-password>';
   CREATE ROLE app_admin LOGIN PASSWORD '<another-strong-password>' BYPASSRLS;
   ```

You now have three connection strings — master (for migrations), `app_user`, `app_admin`. They go
into `MIGRATE_DATABASE_URL`, `DATABASE_URL`, `ADMIN_DATABASE_URL`.

> `DATABASE_URL` must **not** be the master user. It is the RLS-bound pool: a superuser silently
> bypasses row-level security and tenant isolation disappears with no visible error.

## 3. Redis

Managed Redis (ElastiCache `cache.t4g.micro`, or Upstash if you prefer serverless). Same VPC, inbound
`6379` from the EC2 security group only. Use `rediss://` if the provider offers TLS.

One Redis is shared by the API (BullMQ workers, caches) and both frontends (sessions). If you ever run
more than one API replica they **must** share it, or the schedulers double-fire.

## 4. EC2

1. Launch **t3.small** (2 vCPU, 2 GB), Amazon Linux 2023, **x86_64** — the images are built
   `linux/amd64`.
2. Root volume **30 GB** (the three images are ~1.7 GB and every release adds a set).
3. Security group inbound: `22` from your IP only, `80` from anywhere (or from Cloudflare's ranges
   once you are proxying).
4. Install Docker and add swap:

   ```bash
   sudo dnf install -y docker
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user     # log out and back in

   sudo dd if=/dev/zero of=/swapfile bs=1M count=6144
   sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

   Swap is a safety net, not a plan: the stack needs ~380 MB at rest and never touches it. **Do not
   build images on this box** — one app peaks near 1.1 GB, and swapping a build on EBS also burns the
   CPU credits the running app needs.

5. Prune old images on a schedule:

   ```bash
   echo '0 4 * * * docker image prune -af --filter until=168h' | crontab -
   ```

6. Put the deploy files on the box:

   ```bash
   mkdir -p ~/bookingos && cd ~/bookingos
   # copy docker-compose.deploy.yml and docker/nginx/deploy.conf.template here,
   # preserving the docker/nginx/ path (git clone of the repo is fine too)
   ```

## 5. Cloudflare R2

1. R2 → **Create bucket**, e.g. `bookingos-stg`. One bucket **per environment**.
2. **Settings → Public access → Connect a custom domain** → `cdn.stg.bookingos.vn`. This is what
   `S3_PUBLIC_URL` becomes. (The `pub-*.r2.dev` URL is rate-limited — fine to try, not for real use.)
3. **Manage API tokens → Create token**, Object Read & Write, scoped to that bucket. You get an
   access key id + secret, and the account endpoint
   `https://<account_id>.r2.cloudflarestorage.com`.
4. **CORS policy** on the bucket — without this the browser upload fails with no server-side error:

   ```json
   [
     {
       "AllowedOrigins": ["https://bookingstudio.stg.bookingos.vn", "https://admin.stg.bookingos.vn"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add every storefront origin that uploads, including tenant custom domains once §10 is done.

Two settings people get backwards:

| Variable | Value | Why |
| --- | --- | --- |
| `S3_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | where the browser **PUTs** — the presigned URL points here |
| `S3_PUBLIC_URL` | `https://cdn.stg.bookingos.vn` | where objects are **read** afterwards |
| `STORAGE_UPLOAD_ORIGINS` | same origin as `S3_ENDPOINT` | allowlist for the presigned URL; it also becomes the storefront's CSP `connect-src` |

Also `S3_REGION=auto` and `S3_FORCE_PATH_STYLE=true` for R2.

## 6. Resend

1. Add and verify your sending domain (DNS records in Cloudflare), then create an API key.
2. No code change is needed — the API talks plain SMTP:

   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=resend
   SMTP_PASS=re_xxxxxxxx          # the API key
   EMAIL_FROM=no-reply@bookingos.vn
   ```

   `EMAIL_FROM` must be on the verified domain or Resend rejects the message.

> If `SMTP_HOST` is unset the sender degrades to **log-only** and every OTP silently disappears while
> the notification is still recorded as `sent`. Do not leave it blank in a real environment.

## 7. The env file on the server

```bash
cd ~/bookingos
cp .env.deploy.example .env.stg      # from the repo
nano .env.stg                        # fill in every CHANGE_ME
chmod 600 .env.stg
```

Generate the two secrets with `openssl rand -base64 48`:

- `SESSION_SECRET_CURRENT` — cookie signing for both frontends.
- `PAYMENTS_ENC_KEY` — AES-256-GCM master key for tenant gateway credentials. **Keep it identical
  across deploys forever.** Change it and every stored gateway credential becomes undecryptable and
  each tenant must re-enter theirs.

This file lives **only** on the server. CI never uploads it, so these secrets never pass through
GitHub.

## 8. GitHub setup

**Settings → Secrets and variables → Actions:**

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | EC2 public IP or DNS |
| `DEPLOY_USER` | `ec2-user` |
| `DEPLOY_SSH_KEY` | the private key whose public half is in the box's `authorized_keys` |
| `DEPLOY_PATH` | `/home/ec2-user/bookingos` |
| `GHCR_PULL_TOKEN` | PAT with `read:packages` — the box pulls with this; `GITHUB_TOKEN` is only valid inside the runner |

**Settings → Environments → New environment → `prod` → Required reviewers.** That is what makes a
production deploy wait for approval. Create `stg` too (no reviewers) so both names resolve.

## 9. First deploy

Actions → **Deploy** → Run workflow → branch `main`, environment `stg`, app `all`.

It builds three amd64 images, pushes them to GHCR, then SSHes in, pins the image tags into
`.env.stg`, runs migrations and starts everything.

Then seed the tenants — settings only, no demo partners or listings:

```bash
cd ~/bookingos
docker compose --env-file .env.stg -f docker-compose.deploy.yml run --rm \
  -e SEED_SCOPE=tenants -e SEED_OWNER_PASSWORD='<a real password>' \
  api node ./node_modules/ts-node/dist/bin.js --transpile-only prisma/seed.ts

docker compose --env-file .env.stg -f docker-compose.deploy.yml run --rm \
  api node ./node_modules/ts-node/dist/bin.js --transpile-only scripts/bootstrap-storage.ts
```

(On staging you may prefer the full demo data — just omit `SEED_SCOPE`.)

**DNS** — point these at the EC2 IP (proxied through Cloudflare is fine):

```
api.stg      A   <ec2-ip>
admin.stg    A   <ec2-ip>
bookingstudio.stg  A  <ec2-ip>
bookingstad.stg    A  <ec2-ip>
```

If Cloudflare proxies them, set SSL mode **Full** or **Full (strict)** — *Flexible* makes Cloudflare
talk plain HTTP to your origin while telling the browser it is HTTPS, which breaks `Secure` cookies
and login.

**Verify:**

```bash
curl https://api.stg.bookingos.vn/health/ready     # {"status":"ok","db":"up","redis":"up"}
curl https://admin.stg.bookingos.vn/healthz        # {"status":"ok","service":"dashboard"}
curl https://bookingstudio.stg.bookingos.vn/healthz
docker compose --env-file .env.stg -f docker-compose.deploy.yml ps
```

Then log in to the dashboard as `owner@bookingstudio.vn`, add a listing with an image (exercises R2 +
CORS end to end), and trigger a password reset (exercises Resend).

## 10. Tenant custom domains (do this last)

Everything above works without it. This step lets a tenant point **their own** domain at their
storefront.

The storefront is nginx's **default server**, so any hostname that reaches the box already lands on
it — no nginx change is needed per tenant. What the platform still needs is a TLS certificate for a
domain you do not own, which is what **Cloudflare for SaaS (Custom Hostnames)** provides.

1. Cloudflare → your zone → **SSL/TLS → Custom Hostnames** → enable (paid add-on).
2. Set the **fallback origin** to a hostname that resolves to the EC2 box, e.g.
   `origin.stg.bookingos.vn`.
3. For each tenant domain, create a Custom Hostname; the tenant adds the CNAME/TXT Cloudflare asks
   for.
4. In the dashboard, the tenant adds the same domain — the app stores it in `tenant_domains` and
   verifies it with a `_bookingos-verify` TXT record. Cloudflare's validation and the app's are
   **separate**: Cloudflare proves it may issue a certificate, the app proves the domain belongs to
   that tenant. Both must pass.
5. Add the new origin to the R2 CORS list if that tenant uploads images.

---

## Config worth adding that nothing forces you to

None of these block a deploy; all of them will be missed at 2am.

- **Database backups.** Enable automated snapshots and set a retention window. Migrations are
  forward-only — a rollback does not undo one, so a restore is the only way back.
- **`PAYMENTS_ENC_KEY` escrow.** Store it somewhere other than the EC2 box (a password manager, AWS
  Secrets Manager). If the instance dies and the key dies with it, every tenant's gateway credential
  is unrecoverable.
- **Uptime check** on `/health/ready` (not `/healthz`) — only the former proves Postgres and Redis are
  reachable.
- **`SWAGGER_ENABLED`** must stay `false` on production; it defaults off outside dev, so simply never
  set it there.
- **`ALLOW_MOCK_PAYMENTS=false`.** The storefront refuses to boot with it on in production, which is a
  good failure — but staging is `NODE_ENV=production` too, so mock checkout will not work there either.
  Use a gateway sandbox on staging.
- **Log shipping.** Compose keeps `10m × 5` per container, then discards. That is fine until you need
  last week.
- **Payment webhooks** must reach `api.<domain>` from the public internet. If you tighten the security
  group to Cloudflare ranges, gateways calling directly will be blocked — check each provider's
  source IPs.
- **`docker compose ps` after a deploy is not enough.** A container can be `Up` while the API is
  failing readiness; the workflow does not gate on that yet.
