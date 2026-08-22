#!/usr/bin/env node

/**
 * BookingOS Local Multi-Tier Smoke Test Runner
 *
 * Verifies local infrastructure, database, cache, API readiness,
 * Caddy ingress configuration, tenant host routing, payment readiness,
 * and public HTTPS tunnel health reachability.
 *
 * Usage:
 *   pnpm smoke:local
 */

import { execFileSync } from "node:child_process";
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
const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/booking";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const HTTP_TIMEOUT_MS = 5000;
const REQUIRED_COMPOSE_SERVICES = ["postgres", "redis", "minio", "mailpit"];

const checks = [];

function record(tier, name, passed, details = "") {
  checks.push({ tier, name, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`  ${icon} [${tier}] ${name}${details ? ` (${details})` : ""}`);
}

async function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      finish({ status: 0, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(parsed, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        finish({ status: res.statusCode, headers: res.headers, body: data, json });
      });
      res.on("error", (err) => finish({ status: 0, error: err.message }));
    });

    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error(`request timed out after ${HTTP_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => finish({ status: 0, error: err.message }));
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

function parsePublicHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (parsed.protocol !== "https:" || isLoopback) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function main() {
  console.log("\n========================================================================");
  console.log("            🔍 BOOKINGOS LOCAL MULTI-TIER SMOKE TEST");
  console.log("========================================================================\n");

  // ─── TIER 1: Infrastructure & Containers ───
  console.log("📦 TIER 1: Infrastructure & Storage Services");

  // 1.1 Docker Compose Services
  try {
    const runningServices = execFileSync(
      "docker",
      ["compose", "ps", "--services", "--status", "running"],
      { cwd: ROOT_DIR, stdio: ["ignore", "pipe", "ignore"] },
    )
      .toString()
      .split(/\r?\n/)
      .map((service) => service.trim())
      .filter(Boolean);
    const missingServices = REQUIRED_COMPOSE_SERVICES.filter(
      (service) => !runningServices.includes(service),
    );
    record(
      "INFRA",
      "Docker Compose Services",
      missingServices.length === 0,
      missingServices.length === 0
        ? REQUIRED_COMPOSE_SERVICES.join(", ")
        : `missing/not running: ${missingServices.join(", ")}`,
    );
  } catch (err) {
    record(
      "INFRA",
      "Docker Compose Services",
      false,
      `docker compose check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 1.2 PostgreSQL & Prisma Connection
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const tenantCount = await prisma.tenant.count();
    const tableCheck = await prisma.$queryRaw`SELECT 1 as connected`;
    record(
      "DATABASE",
      "PostgreSQL Connection & Schema",
      !!tableCheck && tenantCount > 0,
      `${tenantCount} tenants in DB`,
    );
  } catch (err) {
    record(
      "DATABASE",
      "PostgreSQL Connection & Schema",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 1.3 Redis Connection
  try {
    const redis = new Redis(REDIS_URL, {
      connectTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    record("CACHE", "Redis Connection (PING/PONG)", pong === "PONG", "Redis 7 active");
  } catch (err) {
    record(
      "CACHE",
      "Redis Connection (PING/PONG)",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log("");

  // ─── TIER 2: API & Health Endpoints ───
  console.log("🚀 TIER 2: API & Application Health");

  // 2.1 API Liveness
  const healthRes = await httpGet(`${API_BASE}/health`);
  record(
    "API",
    "API Liveness (/health)",
    healthRes.status === 200 && healthRes.json?.status === "ok",
    healthRes.error ? healthRes.error : `HTTP ${healthRes.status}`,
  );

  // 2.2 API Readiness
  const readyRes = await httpGet(`${API_BASE}/health/ready`);
  const isReady =
    readyRes.status === 200 &&
    readyRes.json?.status === "ok" &&
    readyRes.json?.db === "up" &&
    readyRes.json?.redis === "up";
  record(
    "API",
    "API Readiness (/health/ready)",
    isReady,
    readyRes.error
      ? readyRes.error
      : `db=${readyRes.json?.db}, redis=${readyRes.json?.redis}`,
  );

  console.log("");

  // ─── TIER 3: Host Routing & Ingress Rules ───
  console.log("🌐 TIER 3: Multi-Tenant Host Routing & Ingress");

  // 3.1 StudioHub Storefront Host
  const studioRes = await httpGet(`${API_BASE}/public/tenant`, {
    "x-forwarded-host": "studiohub.localhost",
  });
  record(
    "ROUTING",
    "Tenant Resolution (studiohub.localhost)",
    studioRes.status === 200 && studioRes.json?.slug === "studiohub",
    `Tenant: ${studioRes.json?.name}`,
  );

  // 3.2 BookingStad Storefront Host
  const stadRes = await httpGet(`${API_BASE}/public/tenant`, {
    "x-forwarded-host": "bookingstad.localhost",
  });
  record(
    "ROUTING",
    "Tenant Resolution (bookingstad.localhost)",
    stadRes.status === 200 && stadRes.json?.slug === "bookingstad",
    `Tenant: ${stadRes.json?.name}`,
  );

  // 3.3 StudioHub Tenant Admin Console Host
  const adminTenantRes = await httpGet(`${API_BASE}/public/admin-tenant`, {
    "x-forwarded-host": "admin.studiohub.localhost",
  });
  record(
    "ROUTING",
    "Admin Host Resolution (admin.studiohub.localhost)",
    adminTenantRes.status === 200 && adminTenantRes.json?.slug === "studiohub",
    `Admin slug: ${adminTenantRes.json?.slug}`,
  );

  // 3.4 Caddy On-Demand TLS Check Hook
  const tlsAllowedRes = await httpGet(
    `${API_BASE}/public/domains/tls-allowed?domain=studiohub.localhost`,
  );
  const tlsAllowed = tlsAllowedRes.status === 200 && tlsAllowedRes.json?.allowed === true;
  record(
    "ROUTING",
    "Caddy On-Demand TLS Gate (/public/domains/tls-allowed)",
    tlsAllowed,
    tlsAllowedRes.error ? tlsAllowedRes.error : `Allowed: ${tlsAllowed}`,
  );

  // 3.5 Caddyfile Ingress Validation
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${ROOT_DIR}/docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro`,
        "-e",
        "ACME_EMAIL=admin@bookingos.local",
        "-e",
        "DASHBOARD_HOST=admin.stg.bookingos.vn",
        "-e",
        "API_HOST=api.stg.bookingos.vn",
        "-e",
        "PLATFORM_BASE_DOMAIN=stg.bookingos.vn",
        "caddy:2",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    record("INGRESS", "Caddyfile Syntax & Directives", true, "Caddy 2 validate exit 0");
  } catch (err) {
    record(
      "INGRESS",
      "Caddyfile Syntax & Directives",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log("");

  // ─── TIER 4: Payment Gateway & Webhook Tunnel ───
  console.log("💳 TIER 4: Payment Gateway & Webhook Tunnel");

  // 4.1 Payment Options Availability
  const payOptionsRes = await httpGet(`${API_BASE}/public/payment-options`, {
    "x-forwarded-host": "studiohub.localhost",
  });
  const hasMomo =
    payOptionsRes.json?.methods?.includes("momo_wallet") ||
    payOptionsRes.json?.methods?.some(
      (method) => method === "momo_wallet" || method.paymentMethod === "momo_wallet",
    );
  record(
    "PAYMENTS",
    "Payment Options (/public/payment-options)",
    payOptionsRes.status === 200 && hasMomo,
    `MoMo wallet active: ${Boolean(hasMomo)}`,
  );

  // 4.2 MoMo Tenant Credentials — verify the persisted AES-GCM envelope exists,
  // not merely that the JSON column contains a truthy object such as {}.
  try {
    const studiohubTenant = await prisma.tenant.findUnique({ where: { slug: "studiohub" } });
    if (!studiohubTenant) {
      record("PAYMENTS", "Tenant MoMo Gateway Config", false, "studiohub tenant not found");
    } else {
      const momoConfig = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${studiohubTenant.id}'`);
        return tx.tenantGatewayConfig.findFirst({
          where: { tenantId: studiohubTenant.id, gateway: "momo", isActive: true },
        });
      });
      const encryptedCredential = momoConfig?.credentials?.enc;
      const hasEncryptedCredentials =
        typeof encryptedCredential === "string" && encryptedCredential.length > 0;
      record(
        "PAYMENTS",
        "Tenant MoMo Gateway Config",
        hasEncryptedCredentials,
        hasEncryptedCredentials ? "AES-GCM credentials.enc present" : "missing credentials.enc",
      );
    }
  } catch (err) {
    record(
      "PAYMENTS",
      "Tenant MoMo Gateway Config",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4.3 Public HTTPS Tunnel Health Reachability. This proves that the public HTTPS
  // origin reaches this local API; actual MoMo webhook delivery is covered by live UAT.
  const publicUrl = parsePublicHttpsUrl(PUBLIC_API_URL);
  if (publicUrl) {
    const healthUrl = new URL("/health", publicUrl);
    const tunnelRes = await httpGet(healthUrl.toString());
    record(
      "WEBHOOK",
      `Public HTTPS Tunnel Health (${publicUrl.origin})`,
      tunnelRes.status === 200 && tunnelRes.json?.status === "ok",
      tunnelRes.error
        ? tunnelRes.error
        : `HTTPS /health ${tunnelRes.status}; live webhook delivery covered by UAT`,
    );
  } else {
    record(
      "WEBHOOK",
      "Public HTTPS Tunnel Health (PUBLIC_API_URL)",
      false,
      "Set PUBLIC_API_URL to a non-loopback https:// tunnel (trycloudflare/ngrok)",
    );
  }

  await prisma.$disconnect();

  // ─── SUMMARY ───
  console.log("\n========================================================================");
  const passedCount = checks.filter((check) => check.passed).length;
  const totalCount = checks.length;
  console.log(`                     SMOKE RESULT: ${passedCount} / ${totalCount} CHECKS PASSED`);
  if (passedCount === totalCount) {
    console.log("           🎉 ALL LOCAL APPLICATION & INGRESS CHECKS ARE GREEN!");
  } else {
    console.log(`           ⚠️  ${totalCount - passedCount} CHECKS FAILED`);
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
