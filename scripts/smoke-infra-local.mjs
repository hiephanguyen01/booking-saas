#!/usr/bin/env node

/**
 * BookingOS Local Staging-Parity Infrastructure Smoke Runner (Strict)
 *
 * Verifies local container topology, database isolation, the production Caddy
 * config and runtime routing, staging host-resolution contracts, TLS issuance
 * gating, encrypted payment credentials, and public HTTPS tunnel reachability.
 *
 * Usage:
 *   pnpm smoke:infra:local
 */

import { createDecipheriv, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/booking";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const STAGING_API_HOST = process.env.API_HOST || "api.stg.bookingos.vn";
const STAGING_DASHBOARD_HOST =
  process.env.DASHBOARD_HOST || "admin.stg.bookingos.vn";
const STAGING_BASE_DOMAIN =
  process.env.STAGING_BASE_DOMAIN ||
  (process.env.PLATFORM_BASE_DOMAIN?.includes("stg")
    ? process.env.PLATFORM_BASE_DOMAIN
    : "stg.bookingos.vn");

const checks = [];

function record(tier, name, passed, details = "") {
  checks.push({ tier, name, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`  ${icon} [${tier}] ${name}${details ? ` (${details})` : ""}`);
}

function dockerArgs(...args) {
  return execFileSync("docker", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function httpsGetViaCaddy(port, host, requestPath) {
  return new Promise((resolve) => {
    let resolved = false;
    const req = https.request(
      {
        host: "127.0.0.1",
        port,
        path: requestPath,
        method: "GET",
        servername: host,
        rejectUnauthorized: false,
        headers: { host },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (resolved) return;
          resolved = true;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        });
      },
    );

    req.on("timeout", () => {
      if (resolved) return;
      resolved = true;
      req.destroy(new Error("Caddy request timeout"));
      resolve({ status: 0, error: "Caddy request timeout" });
    });

    req.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({ status: 0, error: err.message });
    });

    req.end();
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

function tenantScopedTables() {
  const schema = fs.readFileSync(
    path.join(ROOT_DIR, "apps/api/prisma/schema.prisma"),
    "utf8",
  );
  const tables = [];
  const modelRe = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;
  let match;
  while ((match = modelRe.exec(schema)) !== null) {
    const modelName = match[1];
    const body = match[2];
    if (!modelName || !body) continue;
    const hasTenantId =
      /@map\("tenant_id"\)/.test(body) || /^\s*tenant_id\s/m.test(body);
    if (!hasTenantId) continue;
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    tables.push(mapped?.[1] ?? modelName);
  }
  return [...new Set(tables)].sort();
}

function decodeCanonicalBase64(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null;
  }
  const decoded = Buffer.from(value, "base64");
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedRoundTrip = decoded.toString("base64").replace(/=+$/, "");
  return normalizedInput === normalizedRoundTrip ? decoded : null;
}

function decryptGatewayEnvelope(ciphertext) {
  if (typeof ciphertext !== "string") return null;
  const parts = ciphertext.split(".");
  if (parts.length !== 3) return null;

  const iv = decodeCanonicalBase64(parts[0]);
  const tag = decodeCanonicalBase64(parts[1]);
  const encrypted = decodeCanonicalBase64(parts[2]);
  if (!iv || !tag || !encrypted) return null;

  const validLengths =
    iv.length === 12 && tag.length === 16 && encrypted.length > 0;
  if (!validLengths) return null;

  try {
    const key = createHash("sha256")
      .update(
        process.env.PAYMENTS_ENC_KEY ??
          "dev-payments-encryption-key-change-me",
      )
      .digest();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function smokeUpstreamCaddyfile(name) {
  return `:3000 {
\theader X-Smoke-Upstream "${name}"
\theader X-Seen-Host "{http.request.host}"
\t@ask path /public/domains/tls-allowed
\thandle @ask {
\t\trespond "allowed" 200
\t}
\trespond "ok" 200
}
`;
}

function cleanupCaddyRoutingProbe(state) {
  for (const name of [...state.containers].reverse()) {
    try {
      dockerArgs("rm", "-f", name);
    } catch {}
  }
  if (state.networkName) {
    try {
      dockerArgs("network", "rm", state.networkName);
    } catch {}
  }
  if (state.tempDir) {
    fs.rmSync(state.tempDir, { recursive: true, force: true });
  }
}

async function startCaddyRoutingProbe() {
  const suffix = `${process.pid}-${Date.now()}`;
  const state = {
    networkName: `bookingos-smoke-${suffix}`,
    tempDir: fs.mkdtempSync(path.join(ROOT_DIR, ".smoke-caddy-")),
    containers: [],
  };

  try {
    const productionCaddyPath = path.join(ROOT_DIR, "docker/caddy/Caddyfile");
    const productionCaddy = fs.readFileSync(productionCaddyPath, "utf8");
    const probeCaddy = productionCaddy.replace(
      "{\n\temail {$ACME_EMAIL}",
      "{\n\tlocal_certs\n\temail {$ACME_EMAIL}",
    );
    if (probeCaddy === productionCaddy) {
      throw new Error("Could not inject local_certs into production Caddyfile");
    }

    const ingressConfig = path.join(state.tempDir, "Caddyfile.ingress");
    fs.writeFileSync(ingressConfig, probeCaddy);

    dockerArgs("network", "create", state.networkName);

    for (const upstream of ["api", "storefront", "dashboard"]) {
      const containerName = `bookingos-smoke-${upstream}-${suffix}`;
      const configPath = path.join(state.tempDir, `Caddyfile.${upstream}`);
      fs.writeFileSync(configPath, smokeUpstreamCaddyfile(upstream));
      dockerArgs(
        "run",
        "-d",
        "--rm",
        "--name",
        containerName,
        "--network",
        state.networkName,
        "--network-alias",
        upstream,
        "-v",
        `${configPath}:/etc/caddy/Caddyfile:ro`,
        "caddy:2-alpine",
        "caddy",
        "run",
        "--config",
        "/etc/caddy/Caddyfile",
      );
      state.containers.push(containerName);
    }

    const ingressName = `bookingos-smoke-ingress-${suffix}`;
    dockerArgs(
      "run",
      "-d",
      "--rm",
      "--name",
      ingressName,
      "--network",
      state.networkName,
      "-p",
      "127.0.0.1::443",
      "-e",
      "ACME_EMAIL=admin@bookingos.local",
      "-e",
      `DASHBOARD_HOST=${STAGING_DASHBOARD_HOST}`,
      "-e",
      `API_HOST=${STAGING_API_HOST}`,
      "-e",
      `PLATFORM_BASE_DOMAIN=${STAGING_BASE_DOMAIN}`,
      "-v",
      `${ingressConfig}:/etc/caddy/Caddyfile:ro`,
      "caddy:2-alpine",
      "caddy",
      "run",
      "--config",
      "/etc/caddy/Caddyfile",
    );
    state.containers.push(ingressName);

    const portOutput = dockerArgs("port", ingressName, "443/tcp")
      .trim()
      .split(/\r?\n/)[0];
    const portMatch = /:(\d+)$/.exec(portOutput);
    if (!portMatch) throw new Error(`Could not resolve Caddy probe port: ${portOutput}`);
    const port = Number(portMatch[1]);

    let ready = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await httpsGetViaCaddy(port, STAGING_API_HOST, "/health/ready");
      if (response.status === 200) {
        ready = true;
        break;
      }
      await delay(250);
    }
    if (!ready) throw new Error("Ephemeral Caddy probe did not become ready");

    return {
      port,
      cleanup: () => cleanupCaddyRoutingProbe(state),
    };
  } catch (err) {
    cleanupCaddyRoutingProbe(state);
    throw err;
  }
}

async function caddyRoute(probe, host, requestPath, expectedUpstream) {
  if (!probe) return { ok: false, details: "Caddy probe unavailable" };
  const response = await httpsGetViaCaddy(probe.port, host, requestPath);
  const upstream = String(response.headers?.["x-smoke-upstream"] ?? "");
  const seenHost = String(response.headers?.["x-seen-host"] ?? "");
  return {
    ok:
      response.status === 200 &&
      upstream === expectedUpstream &&
      seenHost === host,
    details: `Caddy→${upstream || "?"}, Host=${seenHost || "?"}`,
  };
}

async function main() {
  console.log("\n========================================================================");
  console.log("       🏛️  BOOKINGOS LOCAL STAGING-PARITY INFRASTRUCTURE SMOKE TEST");
  console.log("========================================================================\n");

  // ─── TIER 1: Topology, Storage & Containers ───
  console.log("📦 TIER 1: Container Topology & Storage Subsystems");

  // 1.1 Docker Compose Services (all 4 required services)
  try {
    const psOutput = dockerArgs("compose", "ps", "--format", "json");
    const requiredServices = ["postgres", "redis", "minio", "mailpit"];
    const all4Up = requiredServices.every((service) => psOutput.includes(service));
    record(
      "TOPOLOGY",
      "Docker Core Services (4/4)",
      all4Up,
      "postgres, redis, minio, mailpit all present in compose",
    );
  } catch {
    const isPgUp = await checkTcp("localhost", 5432);
    const isRedisUp = await checkTcp("localhost", 6379);
    const isMinioUp = await checkTcp("localhost", 9000);
    const isMailpitUp = await checkTcp("localhost", 1025);
    const allPortsUp = isPgUp && isRedisUp && isMinioUp && isMailpitUp;
    record(
      "TOPOLOGY",
      "Docker Core Services (4/4)",
      allPortsUp,
      "fallback ports 5432, 6379, 9000, 1025 reachable",
    );
  }

  // 1.2 Runtime FORCE-RLS invariant for the exact tenant_id model set.
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const tenantCount = await prisma.tenant.count();
    const expectedTenantTables = tenantScopedTables();
    const dbRows = await prisma.$queryRaw`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r';
    `;
    const byTable = new Map(
      Array.isArray(dbRows)
        ? dbRows.map((row) => [row.relname, row])
        : [],
    );
    const rlsOffenders = expectedTenantTables.filter((table) => {
      const row = byTable.get(table);
      return !row || !row.relrowsecurity || !row.relforcerowsecurity;
    });
    const isRlsComplete =
      tenantCount > 0 &&
      expectedTenantTables.length > 0 &&
      rlsOffenders.length === 0;
    const details = isRlsComplete
      ? `${tenantCount} tenants, ${expectedTenantTables.length} tenant tables with FORCE ROW LEVEL SECURITY`
      : `${rlsOffenders.length} RLS offenders: ${rlsOffenders.slice(0, 4).join(", ")}`;
    record(
      "DATABASE",
      "PostgreSQL Tenant Isolation & FORCE-RLS Invariant",
      isRlsComplete,
      details,
    );
  } catch (err) {
    record(
      "DATABASE",
      "PostgreSQL Tenant Isolation & FORCE-RLS Invariant",
      false,
      err.message,
    );
  }

  // 1.3 Redis Cache & Session Store
  try {
    const redis = new Redis(REDIS_URL, {
      connectTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    record(
      "CACHE",
      "Redis Cache / Session Store",
      pong === "PONG",
      "Redis responsive (PING -> PONG)",
    );
  } catch (err) {
    record("CACHE", "Redis Cache / Session Store", false, err.message);
  }

  // 1.4 MinIO Object Storage
  const minioTcp = await checkTcp("localhost", 9000);
  const minioHealth = await httpGet("http://localhost:9000/minio/health/live");
  record(
    "STORAGE",
    "MinIO S3 Compatible Storage",
    minioTcp && minioHealth.status === 200,
    "port 9000 + /minio/health/live HTTP 200",
  );

  // 1.5 Mailpit Transactional SMTP + Web UI
  const mailpitSmtp = await checkTcp("localhost", 1025);
  const mailpitWeb = await httpGet("http://localhost:8025/api/v1/messages");
  record(
    "MAIL",
    "Mailpit SMTP & Web Interface",
    mailpitSmtp && mailpitWeb.status === 200,
    "SMTP 1025 + Web API 8025 HTTP 200",
  );

  console.log("");

  // ─── TIER 2: Caddy Ingress & Security Directives ───
  console.log("🛡️  TIER 2: Caddy Ingress Configuration & Security Directives");

  // 2.1 Validate the exact production Caddyfile with staging host variables.
  try {
    const caddyValidateOut = dockerArgs(
      "run",
      "--rm",
      "-v",
      `${ROOT_DIR}/docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro`,
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
      "/etc/caddy/Caddyfile",
    );
    record(
      "INGRESS",
      "Caddy Staging Ingress Configuration",
      caddyValidateOut.includes("Valid configuration"),
      "Caddy 2 config validation exit 0",
    );
  } catch (err) {
    record(
      "INGRESS",
      "Caddy Staging Ingress Configuration",
      false,
      err.message,
    );
  }

  // 2.2 Verify critical security/routing directives in that same Caddyfile.
  const caddyfileContent = fs.readFileSync(
    path.join(ROOT_DIR, "docker/caddy/Caddyfile"),
    "utf8",
  );
  const hasClientIp = caddyfileContent.includes(
    "X-BookingOS-Client-IP {remote_host}",
  );
  const hasBodyLimit = caddyfileContent.includes("max_size 2MB");
  const hasOnDemandAsk = caddyfileContent.includes(
    "ask http://api:3000/public/domains/tls-allowed",
  );
  const hasApiProxy = caddyfileContent.includes("reverse_proxy api:3000");
  const hasStorefrontProxy = caddyfileContent.includes(
    "reverse_proxy storefront:3000",
  );
  const hasDashboardProxy = caddyfileContent.includes(
    "reverse_proxy dashboard:3000",
  );
  record(
    "SECURITY",
    "Caddy Ingress Security Directives",
    hasClientIp &&
      hasBodyLimit &&
      hasOnDemandAsk &&
      hasApiProxy &&
      hasStorefrontProxy &&
      hasDashboardProxy,
    "client IP, 2MB limit, ask hook, api/storefront/dashboard routes",
  );

  console.log("");

  // ─── TIER 3: Production-Caddy Runtime Routing + App Host Resolution ───
  console.log("🌐 TIER 3: Staging Host-Based Routing & Tenant Resolution");

  let caddyProbe = null;
  let caddyProbeError = "";
  try {
    caddyProbe = await startCaddyRoutingProbe();
  } catch (err) {
    caddyProbeError = err.message;
  }

  try {
    // 3.1 API explicit host: production Caddy route marker + real app readiness.
    const apiRoute = await caddyRoute(
      caddyProbe,
      STAGING_API_HOST,
      "/health/ready",
      "api",
    );
    const stgApiRes = await httpGet(`${API_BASE}/health/ready`, {
      "x-forwarded-host": STAGING_API_HOST,
    });
    record(
      "ROUTING",
      `Staging API Ingress (${STAGING_API_HOST})`,
      apiRoute.ok &&
        stgApiRes.status === 200 &&
        stgApiRes.json?.status === "ok",
      apiRoute.ok
        ? `${apiRoute.details}; app db/redis ready`
        : caddyProbeError || apiRoute.details,
    );

    // 3.2 Tenant storefront: Caddy catch-all -> storefront + app tenant resolver.
    const studioHost = `studiohub.${STAGING_BASE_DOMAIN}`;
    const studioRoute = await caddyRoute(
      caddyProbe,
      studioHost,
      "/public/tenant",
      "storefront",
    );
    const stgStudioRes = await httpGet(`${API_BASE}/public/tenant`, {
      "x-forwarded-host": studioHost,
    });
    record(
      "ROUTING",
      `Staging Storefront (${studioHost})`,
      studioRoute.ok &&
        stgStudioRes.status === 200 &&
        stgStudioRes.json?.slug === "studiohub",
      studioRoute.ok
        ? `${studioRoute.details}; Tenant: ${stgStudioRes.json?.name}`
        : caddyProbeError || studioRoute.details,
    );

    // 3.3 Second storefront proves tenant host varies while route stays storefront.
    const stadHost = `bookingstad.${STAGING_BASE_DOMAIN}`;
    const stadRoute = await caddyRoute(
      caddyProbe,
      stadHost,
      "/public/tenant",
      "storefront",
    );
    const stgStadRes = await httpGet(`${API_BASE}/public/tenant`, {
      "x-forwarded-host": stadHost,
    });
    record(
      "ROUTING",
      `Staging Storefront (${stadHost})`,
      stadRoute.ok &&
        stgStadRes.status === 200 &&
        stgStadRes.json?.slug === "bookingstad",
      stadRoute.ok
        ? `${stadRoute.details}; Tenant: ${stgStadRes.json?.name}`
        : caddyProbeError || stadRoute.details,
    );

    // 3.4 admin.* catch-all -> dashboard + app admin tenant resolver.
    const adminHost = `admin.studiohub.${STAGING_BASE_DOMAIN}`;
    const adminRoute = await caddyRoute(
      caddyProbe,
      adminHost,
      "/public/admin-tenant",
      "dashboard",
    );
    const stgAdminRes = await httpGet(`${API_BASE}/public/admin-tenant`, {
      "x-forwarded-host": adminHost,
    });
    record(
      "ROUTING",
      `Staging Tenant Admin (${adminHost})`,
      adminRoute.ok &&
        stgAdminRes.status === 200 &&
        stgAdminRes.json?.slug === "studiohub",
      adminRoute.ok
        ? `${adminRoute.details}; Admin slug: ${stgAdminRes.json?.slug}`
        : caddyProbeError || adminRoute.details,
    );
  } finally {
    caddyProbe?.cleanup();
  }

  console.log("");

  // ─── TIER 4: On-Demand TLS Dynamic Security Gate ───
  console.log("🔒 TIER 4: On-Demand TLS Dynamic Security Gate");

  const tlsStgAllowed = await httpGet(
    `${API_BASE}/public/domains/tls-allowed?domain=studiohub.${STAGING_BASE_DOMAIN}`,
  );
  record(
    "TLS-GATE",
    `Registered Staging Domain (studiohub.${STAGING_BASE_DOMAIN})`,
    tlsStgAllowed.status === 200 && tlsStgAllowed.json?.allowed === true,
    "TLS certificate issuance PERMITTED",
  );

  const tlsAttackerBlocked = await httpGet(
    `${API_BASE}/public/domains/tls-allowed?domain=unregistered-fake-domain.com`,
  );
  record(
    "TLS-GATE",
    "Unregistered Attacker Domain (unregistered-fake-domain.com)",
    tlsAttackerBlocked.status === 404,
    "TLS certificate issuance SAFELY BLOCKED",
  );

  console.log("");

  // ─── TIER 5: Public HTTPS ingress + encrypted payment infrastructure ───
  console.log("💳 TIER 5: Public Webhook Ingress & Payment Infrastructure");

  // 5.1 Require a decryptable AES-256-GCM credentials.enc under tenant RLS context.
  try {
    const studiohubTenant = await prisma.tenant.findUnique({
      where: { slug: "studiohub" },
    });
    if (!studiohubTenant) throw new Error("studiohub tenant not found");

    const momoConfig = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.tenant_id', ${studiohubTenant.id}, true);
      `;
      return tx.tenantGatewayConfig.findFirst({
        where: {
          tenantId: studiohubTenant.id,
          gateway: "momo",
          isActive: true,
        },
      });
    });

    const encStr = momoConfig?.credentials?.enc;
    const decryptedCredentials = decryptGatewayEnvelope(encStr);
    record(
      "PAYMENTS",
      "Tenant MoMo Gateway Encrypted Secret",
      Boolean(decryptedCredentials),
      "credentials.enc decrypts as AES-256-GCM (12-byte IV, 16-byte tag)",
    );
  } catch (err) {
    record(
      "PAYMENTS",
      "Tenant MoMo Gateway Encrypted Secret",
      false,
      err.message,
    );
  }

  // 5.2 Public tunnel proves external HTTPS reachability; live IPN is covered by UAT.
  let tunnelUrl = null;
  try {
    tunnelUrl = new URL(PUBLIC_API_URL);
  } catch {}
  const isLoopbackHost =
    tunnelUrl?.hostname === "localhost" ||
    tunnelUrl?.hostname === "127.0.0.1" ||
    tunnelUrl?.hostname === "::1";
  const isHttpsTunnel =
    tunnelUrl?.protocol === "https:" && !isLoopbackHost && Boolean(tunnelUrl.hostname);

  if (isHttpsTunnel) {
    const tunnelRes = await httpGet(
      `${PUBLIC_API_URL.replace(/\/$/, "")}/health`,
    );
    record(
      "WEBHOOK",
      `Public Ingress Tunnel (${PUBLIC_API_URL})`,
      tunnelRes.status === 200,
      "external HTTPS /health reachable; live IPN delivery covered by UAT",
    );
  } else {
    record(
      "WEBHOOK",
      "Public Ingress Tunnel (PUBLIC_API_URL)",
      false,
      "PUBLIC_API_URL must be a non-loopback HTTPS tunnel",
    );
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
