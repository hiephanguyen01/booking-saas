#!/usr/bin/env node

/**
 * BookingOS Local Staging-Parity Infrastructure Smoke Runner (Hardened)
 *
 * Verifies local container topology, network isolation, Caddy ingress syntax,
 * staging host-based routing, on-demand TLS security gate, and public webhook ingress.
 *
 * Usage:
 *   pnpm smoke:infra:local
 */

import { execFileSync, execSync } from "node:child_process";
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
    let resolved = false;
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { headers, timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (resolved) return;
        resolved = true;
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on("timeout", () => {
      if (resolved) return;
      resolved = true;
      req.destroy(new Error("Request timeout"));
      resolve({ status: 0, error: "Request timeout" });
    });

    req.on("error", (err) => {
      if (resolved) return;
      resolved = true;
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

  // 1.1 Docker Compose Services (all 4 required services)
  try {
    const psOutput = execSync("docker compose ps --format json", { cwd: ROOT_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const hasPostgres = psOutput.includes("postgres");
    const hasRedis = psOutput.includes("redis");
    const hasMinio = psOutput.includes("minio");
    const hasMailpit = psOutput.includes("mailpit");
    const all4Up = hasPostgres && hasRedis && hasMinio && hasMailpit;
    record("TOPOLOGY", "Docker Core Services (4/4)", all4Up, "postgres, redis, minio, mailpit all running");
  } catch {
    const isPgUp = await checkTcp("localhost", 5432);
    const isRedisUp = await checkTcp("localhost", 6379);
    const isMinioUp = await checkTcp("localhost", 9000);
    const isMailpitUp = await checkTcp("localhost", 1025);
    const allPortsUp = isPgUp && isRedisUp && isMinioUp && isMailpitUp;
    record("TOPOLOGY", "Docker Core Services (4/4)", allPortsUp, "5432, 6379, 9000, 1025 reachable");
  }

  // 1.2 PostgreSQL & Prisma FORCE RLS Invariant across tenant tables
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const tenantCount = await prisma.tenant.count();
    const rlsRows = await prisma.$queryRaw`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;
    `;
    const forceRlsCount = Array.isArray(rlsRows) ? rlsRows.filter((r) => r.relrowsecurity && r.relforcerowsecurity).length : 0;
    const isRlsComplete = forceRlsCount >= 50 && tenantCount > 0;
    record("DATABASE", "PostgreSQL Tenant Isolation & FORCE-RLS Invariant", isRlsComplete, `${tenantCount} tenants, ${forceRlsCount} tables with FORCE ROW LEVEL SECURITY`);
  } catch (err) {
    record("DATABASE", "PostgreSQL Tenant Isolation & FORCE-RLS Invariant", false, err.message);
  }

  // 1.3 Redis Cache & Session Store
  try {
    const redis = new Redis(REDIS_URL, { connectTimeout: 3000, lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    record("CACHE", "Redis Cache / Session Store", pong === "PONG", "Redis 7 responsive (PING -> PONG)");
  } catch (err) {
    record("CACHE", "Redis Cache / Session Store", false, err.message);
  }

  // 1.4 MinIO Object Storage
  const minioTcp = await checkTcp("localhost", 9000);
  const minioHealth = await httpGet("http://localhost:9000/minio/health/live");
  record("STORAGE", "MinIO S3 Compatible Storage", minioTcp && minioHealth.status === 200, "port 9000 /minio/health/live HTTP 200");

  // 1.5 Mailpit Transactional SMTP + Web UI (both probed)
  const mailpitSmtp = await checkTcp("localhost", 1025);
  const mailpitWeb = await httpGet("http://localhost:8025/api/v1/messages");
  record("MAIL", "Mailpit SMTP & Web Interface", mailpitSmtp && mailpitWeb.status === 200, "SMTP port 1025 + Web API port 8025 HTTP 200");

  console.log("");

  // ─── TIER 2: Caddy Ingress & Security Directives ───
  console.log("🛡️  TIER 2: Caddy Ingress Configuration & Security Directives");

  // 2.1 Caddyfile Syntax Validation with Safe execFileSync (no shell injection)
  try {
    const caddyValidateOut = execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${ROOT_DIR}/docker/caddy/Caddyfile:/etc/caddy/Caddyfile`,
        "-e",
        "ACME_EMAIL=admin@bookingos.local",
        "-e",
        `DASHBOARD_HOST=${STAGING_DASHBOARD_HOST}`,
        "-e",
        `API_HOST=${STAGING_API_HOST}`,
        "-e",
        `PLATFORM_BASE_DOMAIN=${STAGING_BASE_DOMAIN}`,
        "caddy:2",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile"
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    record("INGRESS", "Caddy Staging Ingress Configuration", caddyValidateOut.includes("Valid configuration"), "Caddy 2 config validation exit 0");
  } catch (err) {
    record("INGRESS", "Caddy Staging Ingress Configuration", false, err.message);
  }

  // 2.2 Caddy Ingress Directives & Security Rules
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

  // ─── TIER 4: On-Demand TLS Dynamic Security Gate ───
  console.log("🔒 TIER 4: On-Demand TLS Dynamic Security Gate");

  // 4.1 Allowed Registered Staging Domain
  const tlsStgAllowed = await httpGet(`${API_BASE}/public/domains/tls-allowed?domain=studiohub.${STAGING_BASE_DOMAIN}`);
  record("TLS-GATE", `Registered Staging Domain (studiohub.${STAGING_BASE_DOMAIN})`, tlsStgAllowed.status === 200 && tlsStgAllowed.json?.allowed === true, "TLS certificate issuance PERMITTED");

  // 4.2 Blocked Unregistered / Attacker Domain
  const tlsAttackerBlocked = await httpGet(`${API_BASE}/public/domains/tls-allowed?domain=unregistered-fake-domain.com`);
  record("TLS-GATE", "Unregistered Attacker Domain (unregistered-fake-domain.com)", tlsAttackerBlocked.status === 404, "TLS certificate issuance SAFELY BLOCKED");

  console.log("");

  // ─── TIER 5: Public Webhook Ingress & Payment Storage ───
  console.log("💳 TIER 5: Public Webhook Ingress & Payment Infrastructure");

  // 5.1 MoMo Gateway AES-GCM Encrypted Blob Format (credentials.enc) under RLS
  try {
    const studiohubTenant = await prisma.tenant.findUnique({ where: { slug: "studiohub" } });
    const momoConfig = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${studiohubTenant.id}'`);
      return tx.tenantGatewayConfig.findFirst({
        where: { tenantId: studiohubTenant.id, gateway: "momo", isActive: true }
      });
    });
    const encStr = momoConfig?.credentials?.enc;
    const isAesGcmFormat = typeof encStr === "string" && encStr.split(".").length === 3;
    record("PAYMENTS", "Tenant MoMo Gateway Encrypted Secret", isAesGcmFormat, "AES-GCM credentials.enc envelope (iv.tag.ciphertext)");
  } catch (err) {
    record("PAYMENTS", "Tenant MoMo Gateway Encrypted Secret", false, err.message);
  }

  // 5.2 Public HTTPS Ingress Tunnel (enforcing non-loopback HTTPS URL)
  const isHttpsTunnel = PUBLIC_API_URL.startsWith("https://") && !PUBLIC_API_URL.includes("localhost") && !PUBLIC_API_URL.includes("127.0.0.1");
  if (isHttpsTunnel) {
    const tunnelRes = await httpGet(`${PUBLIC_API_URL}/health`);
    record("WEBHOOK", `Public Ingress Tunnel (${PUBLIC_API_URL})`, tunnelRes.status === 200, "External HTTPS tunnel alive & forwards to local API");
  } else {
    record("WEBHOOK", "Public Ingress Tunnel (PUBLIC_API_URL)", false, "PUBLIC_API_URL must be a valid HTTPS tunnel (e.g. trycloudflare / ngrok)");
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
