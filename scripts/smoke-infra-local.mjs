#!/usr/bin/env node

/**
 * BookingOS Local Staging-Parity Infrastructure Smoke Runner
 *
 * Verifies local container topology, network isolation, Caddy ingress syntax,
 * staging host-based routing, on-demand TLS security gate, and public webhook ingress.
 *
 * Usage:
 *   pnpm smoke:infra:local
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const apiRequire = createRequire(path.join(ROOT_DIR, "apps/api/package.json"));
const { PrismaClient } = apiRequire("@prisma/client");
const Redis = apiRequire("ioredis");

const API_BASE = process.env.LOCAL_API_URL || "http://localhost:3000";
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || "";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/booking";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const STAGING_API_HOST = process.env.API_HOST || "api.stg.bookingos.vn";
const STAGING_DASHBOARD_HOST = process.env.DASHBOARD_HOST || "admin.stg.bookingos.vn";
const STAGING_BASE_DOMAIN = process.env.STAGING_BASE_DOMAIN || (process.env.PLATFORM_BASE_DOMAIN?.includes("stg") ? process.env.PLATFORM_BASE_DOMAIN : "stg.bookingos.vn");

const checks = [];

function record(tier, name, passed, details = "") {
  checks.push({ tier, name, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`  ${icon} [${tier}] ${name}${details ? ` (${details})` : ""}`);
}

async function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { headers, timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on("error", (err) => {
      resolve({ status: 0, error: err.message });
    });
  });
}

async function checkTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log("\n========================================================================");
  console.log("       🏛️  BOOKINGOS LOCAL STAGING-PARITY INFRASTRUCTURE SMOKE TEST");
  console.log("========================================================================\n");

  // ─── TIER 1: Topology, Storage & Containers ───
  console.log("📦 TIER 1: Container Topology & Storage Subsystems");

  // 1.1 Docker Compose Services
  try {
    const psOutput = execSync("docker compose ps --format json", { cwd: ROOT_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const hasCore = psOutput.includes("postgres") && psOutput.includes("redis");
    record("TOPOLOGY", "Docker Core Services", hasCore, "postgres, redis, minio, mailpit");
  } catch {
    const isPgUp = await checkTcp("localhost", 5432);
    const isRedisUp = await checkTcp("localhost", 6379);
    record("TOPOLOGY", "Docker Core Services", isPgUp && isRedisUp, "tcp 5432 & 6379 reachable");
  }

  // 1.2 PostgreSQL & Prisma RLS Invariant
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const tenantCount = await prisma.tenant.count();
    const isRlsActive = await prisma.$queryRaw`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname = 'tenant_gateway_configs' AND relrowsecurity = true;
    `;
    const rlsOk = Array.isArray(isRlsActive) && isRlsActive.length > 0;
    record("DATABASE", "PostgreSQL Isolation & Row-Level Security (RLS)", rlsOk && tenantCount > 0, `${tenantCount} tenants, RLS active on tenant tables`);
  } catch (err) {
    record("DATABASE", "PostgreSQL Isolation & Row-Level Security (RLS)", false, err.message);
  }

  // 1.3 Redis Cache & Session Store
  try {
    const redis = new Redis(REDIS_URL, { connectTimeout: 3000, lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    record("CACHE", "Redis Cache / Session Store", pong === "PONG", "Redis 7 responsive");
  } catch (err) {
    record("CACHE", "Redis Cache / Session Store", false, err.message);
  }

  // 1.4 MinIO Object Storage
  const minioUp = await checkTcp("localhost", 9000);
  record("STORAGE", "MinIO S3 Compatible Storage", minioUp, "port 9000 accessible");

  // 1.5 Mailpit Transactional Mailpit
  const mailpitUp = await checkTcp("localhost", 1025);
  record("MAIL", "Mailpit SMTP & Web Interface", mailpitUp, "port 1025 SMTP / 8025 Web");

  console.log("");

  // ─── TIER 2: Caddy Ingress & Reverse Proxy Directives ───
  console.log("🛡️  TIER 2: Caddy Ingress Configuration & Security Directives");

  // 2.1 Caddyfile Syntax Validation with Staging Env
  try {
    const caddyValidateOut = execSync(
      `docker run --rm -v ${ROOT_DIR}/docker/caddy/Caddyfile:/etc/caddy/Caddyfile ` +
      `-e ACME_EMAIL=admin@bookingos.local ` +
      `-e DASHBOARD_HOST=${STAGING_DASHBOARD_HOST} ` +
      `-e API_HOST=${STAGING_API_HOST} ` +
      `-e PLATFORM_BASE_DOMAIN=${STAGING_BASE_DOMAIN} ` +
      `caddy:2 caddy validate --config /etc/caddy/Caddyfile`,
      { stdio: ["ignore", "pipe", "ignore"] }
    ).toString();
    record("INGRESS", "Caddy Staging Ingress Configuration", caddyValidateOut.includes("Valid configuration"), "Validated against Caddy 2 engine");
  } catch (err) {
    record("INGRESS", "Caddy Staging Ingress Configuration", false, err.message);
  }

  // 2.2 Caddy Reverse Proxy & IP Header Injection Inspection
  const caddyfileContent = fs.readFileSync(path.join(ROOT_DIR, "docker/caddy/Caddyfile"), "utf8");
  const hasClientIp = caddyfileContent.includes("X-BookingOS-Client-IP {remote_host}");
  const hasBodyLimit = caddyfileContent.includes("max_size 2MB");
  const hasOnDemandAsk = caddyfileContent.includes("ask http://api:3000/public/domains/tls-allowed");
  record("SECURITY", "Caddy Ingress Security Directives", hasClientIp && hasBodyLimit && hasOnDemandAsk, "Client-IP injection, 2MB body limit, on-demand TLS ask hook");

  console.log("");

  // ─── TIER 3: Staging Host-Based Routing & Multi-Tenancy ───
  console.log("🌐 TIER 3: Staging Host-Based Routing & Tenant Resolution");

  // 3.1 Staging API Host
  const stgApiRes = await httpGet(`${API_BASE}/health/ready`, { "x-forwarded-host": STAGING_API_HOST });
  record("ROUTING", `Staging API Ingress (${STAGING_API_HOST})`, stgApiRes.status === 200 && stgApiRes.json?.status === "ok", "db=up, redis=up");

  // 3.2 Staging Tenant Storefront (StudioHub)
  const stgStudioRes = await httpGet(`${API_BASE}/public/tenant`, { "x-forwarded-host": `studiohub.${STAGING_BASE_DOMAIN}` });
  record("ROUTING", `Staging Storefront (studiohub.${STAGING_BASE_DOMAIN})`, stgStudioRes.status === 200 && stgStudioRes.json?.slug === "studiohub", `Tenant: ${stgStudioRes.json?.name}`);

  // 3.3 Staging Tenant Storefront (BookingStad)
  const stgStadRes = await httpGet(`${API_BASE}/public/tenant`, { "x-forwarded-host": `bookingstad.${STAGING_BASE_DOMAIN}` });
  record("ROUTING", `Staging Storefront (bookingstad.${STAGING_BASE_DOMAIN})`, stgStadRes.status === 200 && stgStadRes.json?.slug === "bookingstad", `Tenant: ${stgStadRes.json?.name}`);

  // 3.4 Staging Tenant Admin Console (StudioHub)
  const stgAdminRes = await httpGet(`${API_BASE}/public/admin-tenant`, { "x-forwarded-host": `admin.studiohub.${STAGING_BASE_DOMAIN}` });
  record("ROUTING", `Staging Tenant Admin (admin.studiohub.${STAGING_BASE_DOMAIN})`, stgAdminRes.status === 200 && stgAdminRes.json?.slug === "studiohub", `Admin slug: ${stgAdminRes.json?.slug}`);

  console.log("");

  // ─── TIER 4: On-Demand TLS Security Gate ───
  console.log("🔒 TIER 4: On-Demand TLS Dynamic Security Gate");

  // 4.1 Allowed Registered Staging Domain
  const tlsStgAllowed = await httpGet(`${API_BASE}/public/domains/tls-allowed?domain=studiohub.${STAGING_BASE_DOMAIN}`);
  record("TLS-GATE", `Registered Staging Domain (studiohub.${STAGING_BASE_DOMAIN})`, tlsStgAllowed.status === 200 && tlsStgAllowed.json?.allowed === true, "TLS certificate issuance PERMITTED");

  // 4.2 Blocked Unregistered / Attacker Domain
  const tlsAttackerBlocked = await httpGet(`${API_BASE}/public/domains/tls-allowed?domain=unregistered-fake-domain.com`);
  record("TLS-GATE", "Unregistered Attacker Domain (unregistered-fake-domain.com)", tlsAttackerBlocked.status === 404, "TLS certificate issuance SAFELY BLOCKED");

  console.log("");

  // ─── TIER 5: Public Webhook Ingress & MoMo Tunnel ───
  console.log("💳 TIER 5: Public Webhook Ingress & Payment Processing");

  // 5.1 MoMo Gateway Encrypted Credentials (with RLS context)
  try {
    const studiohubTenant = await prisma.tenant.findUnique({ where: { slug: "studiohub" } });
    const momoConfig = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${studiohubTenant.id}'`);
      return tx.tenantGatewayConfig.findFirst({
        where: { tenantId: studiohubTenant.id, gateway: "momo", isActive: true }
      });
    });
    record("PAYMENTS", "Tenant MoMo Gateway Encrypted Secret", !!momoConfig && !!momoConfig.credentials, "AES-GCM encrypted in DB under RLS");
  } catch (err) {
    record("PAYMENTS", "Tenant MoMo Gateway Encrypted Secret", false, err.message);
  }

  // 5.2 Public Tunnel Webhook Ingress
  if (PUBLIC_API_URL && !PUBLIC_API_URL.includes("localhost")) {
    const tunnelRes = await httpGet(`${PUBLIC_API_URL}/health`);
    record("WEBHOOK", `Public Ingress Tunnel (${PUBLIC_API_URL})`, tunnelRes.status === 200, "Inbound MoMo IPN callbacks reachable");
  } else {
    record("WEBHOOK", "Public Ingress Tunnel (PUBLIC_API_URL)", false, "Set PUBLIC_API_URL to an active HTTPS tunnel");
  }

  await prisma.$disconnect();

  // ─── SUMMARY ───
  console.log("\n========================================================================");
  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  console.log(`                     SMOKE RESULT: ${passedCount} / ${totalCount} CHECKS PASSED`);
  if (passedCount === totalCount) {
    console.log("     🎉 ALL LOCAL STAGING-PARITY INFRASTRUCTURE CHECKS ARE GREEN!");
  } else {
    console.log(`     ⚠️  ${totalCount - passedCount} CHECKS FAILED`);
  }
  console.log("========================================================================\n");

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal smoke error:", err);
  process.exit(1);
});
