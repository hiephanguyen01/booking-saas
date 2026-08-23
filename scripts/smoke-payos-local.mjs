#!/usr/bin/env node

/**
 * BookingOS Local PayOS Real-Channel Smoke Test Runner
 *
 * Exercises the complete real PayOS gateway lifecycle on local environment:
 * - Validates credentials and disposable channel safety gate
 * - Starts Docker infrastructure (postgres, redis, minio, mailpit)
 * - Deploys database schema & compiles API
 * - Starts an HTTP capture proxy (port 18081) & Cloudflare HTTPS tunnel (HTTP/2 protocol)
 * - Synchronizes PUBLIC_API_URL in .env and launches NestJS API on dedicated port 18080
 * - Logs in as StudioHub tenant owner
 * - Configures tenant PayOS gateway credentials
 * - Asserts config active state & credential redaction
 * - Calls /tenant/gateway-config/payos/confirm-webhook
 * - Captures incoming PayOS sample webhook & verifies HMAC signature
 * - Gracefully restores .env, cleans up processes and temporary artifacts
 *
 * Usage:
 *   export PAYOS_CLIENT_ID='...'
 *   export PAYOS_API_KEY='...'
 *   export PAYOS_CHECKSUM_KEY='...'
 *   export PAYOS_SMOKE_DISPOSABLE_CHANNEL=true
 *   pnpm smoke:payos:local
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const apiRequire = createRequire(path.join(ROOT_DIR, "apps/api/package.json"));
const { PrismaClient } = apiRequire("@prisma/client");

const API_PORT = 18080;
const PROXY_PORT = 18081;

const checks = [];
let proxyServer = null;
let tunnelProc = null;
let apiProc = null;
let originalEnvContent = null;
const tunnelLogs = [];

function record(tier, name, passed, details = "") {
  checks.push({ tier, name, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`  ${icon} [${tier}] ${name}${details ? ` (${details})` : ""}`);
}

function findCloudflared() {
  if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }
  try {
    const which = execFileSync("which", ["cloudflared"], { encoding: "utf8" }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {}
  for (const candidate of ["/opt/homebrew/bin/cloudflared", "/usr/local/bin/cloudflared"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateEnvFile(key, value) {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;
  if (originalEnvContent === null) {
    originalEnvContent = fs.readFileSync(envPath, "utf8");
  }
  let content = fs.readFileSync(envPath, "utf8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content, "utf8");
}

function restoreEnvFile() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (originalEnvContent !== null && fs.existsSync(envPath)) {
    try {
      fs.writeFileSync(envPath, originalEnvContent, "utf8");
    } catch {}
    originalEnvContent = null;
  }
}

function signedPayload(data, checksumKey) {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ""}`)
    .join("&");
  return createHmac("sha256", checksumKey).update(query).digest("hex");
}

function safeHexEqual(expectedHex, actualHex) {
  if (typeof actualHex !== "string" || !/^[0-9a-fA-F]+$/.test(actualHex)) return false;
  if (!/^[0-9a-fA-F]+$/.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function httpFetch({ url, method = "GET", headers = {}, body = null, timeoutMs = 10000 }) {
  try {
    const init = {
      method,
      headers: { ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body !== null && body !== undefined) {
      if (typeof body === "object" && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
        init.body = JSON.stringify(body);
        init.headers["content-type"] = init.headers["content-type"] || "application/json";
      } else {
        init.body = body;
      }
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")]
          : [];

    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      setCookies,
      body: text,
      json,
    };
  } catch (err) {
    return {
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      headers: {},
      setCookies: [],
      body: "",
      json: null,
    };
  }
}

function extractCookieHeader(res) {
  if (!res.setCookies || res.setCookies.length === 0) return "";
  return res.setCookies.map((c) => c.split(";")[0].trim()).join("; ");
}

function killPort(port) {
  try {
    const output = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" }).trim();
    if (!output) return;
    const pids = output.split("\n").map((s) => s.trim()).filter(Boolean);
    for (const pid of pids) {
      const num = Number(pid);
      if (num && num !== process.pid) {
        try {
          process.kill(num, "SIGKILL");
        } catch {}
      }
    }
  } catch {}
}

function cleanup() {
  restoreEnvFile();
  if (proxyServer) {
    try {
      proxyServer.close();
    } catch {}
    proxyServer = null;
  }
  if (tunnelProc) {
    try {
      process.kill(-tunnelProc.pid, "SIGTERM");
    } catch {
      try {
        tunnelProc.kill("SIGTERM");
      } catch {}
    }
    tunnelProc = null;
  }
  if (apiProc) {
    try {
      process.kill(-apiProc.pid, "SIGTERM");
    } catch {
      try {
        apiProc.kill("SIGTERM");
      } catch {}
    }
    apiProc = null;
  }
  killPort(API_PORT);
  killPort(PROXY_PORT);
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

async function main() {
  console.log("\n========================================================================");
  console.log("       💳 BOOKINGOS LOCAL PAYOS REAL-CHANNEL SMOKE RUNNER");
  console.log("========================================================================\n");

  // ─── TIER 1: Safety Gates & Prerequisites ───
  console.log("🛡️ TIER 1: Safety Gates & Environment Prerequisites");

  const clientId = process.env.PAYOS_CLIENT_ID?.trim() || "";
  const apiKey = process.env.PAYOS_API_KEY?.trim() || "";
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim() || "";
  const disposableGate = process.env.PAYOS_SMOKE_DISPOSABLE_CHANNEL === "true";

  if (!disposableGate) {
    record(
      "GATE",
      "Disposable Channel Guard (PAYOS_SMOKE_DISPOSABLE_CHANNEL=true)",
      false,
      "PayOS confirm-webhook mutates your channel webhook URL. Set PAYOS_SMOKE_DISPOSABLE_CHANNEL=true on a disposable test channel.",
    );
    process.exit(1);
  } else {
    record(
      "GATE",
      "Disposable Channel Guard",
      true,
      "Safety gate passed: using disposable channel",
    );
  }

  const missingCreds = [];
  if (!clientId) missingCreds.push("PAYOS_CLIENT_ID");
  if (!apiKey) missingCreds.push("PAYOS_API_KEY");
  if (!checksumKey) missingCreds.push("PAYOS_CHECKSUM_KEY");

  if (missingCreds.length > 0) {
    record(
      "GATE",
      "PayOS Credentials Present",
      false,
      `Missing: ${missingCreds.join(", ")}`,
    );
    process.exit(1);
  } else {
    record(
      "GATE",
      "PayOS Credentials Present",
      true,
      `Client ID: ${clientId.slice(0, 6)}... (checksumKey provided)`,
    );
  }

  const cloudflaredBin = findCloudflared();
  if (!cloudflaredBin) {
    record(
      "PREREQ",
      "Cloudflared Tunnel Binary",
      false,
      "cloudflared not found in PATH or /opt/homebrew/bin/cloudflared. Install via `brew install cloudflared`",
    );
    process.exit(1);
  } else {
    record("PREREQ", "Cloudflared Tunnel Binary", true, cloudflaredBin);
  }

  const paymentsEncKey =
    process.env.PAYMENTS_ENC_KEY?.trim() || randomBytes(48).toString("base64");
  const databaseUrl =
    process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/booking";

  console.log("");

  // ─── TIER 2: Docker Infrastructure & DB Migration ───
  console.log("📦 TIER 2: Local Infrastructure & Database");

  killPort(API_PORT);
  killPort(PROXY_PORT);

  try {
    console.log("  → Ensuring Docker containers are running (postgres, redis, minio, mailpit)...");
    execFileSync("docker", ["compose", "up", "-d", "postgres", "redis", "minio", "mailpit"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    record("INFRA", "Docker Compose Services", true, "postgres, redis, minio, mailpit up");
  } catch (err) {
    record(
      "INFRA",
      "Docker Compose Services",
      false,
      `Failed to start compose services: ${err.message}`,
    );
    process.exit(1);
  }

  try {
    console.log("  → Running Prisma migrate deploy & generate & build API...");
    execFileSync("pnpm", ["--filter=@booking/api", "prisma:deploy"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    execFileSync("pnpm", ["--filter=@booking/api", "prisma:generate"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    execFileSync("pnpm", ["--filter=@booking/api", "build"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    record("DATABASE", "Prisma Deploy & API Build", true, "Schema migrated & API compiled to dist");
  } catch (err) {
    record(
      "DATABASE",
      "Prisma Deploy & API Build",
      false,
      `Prisma deploy or build failed: ${err.message}`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let studiohubTenant = null;
  try {
    studiohubTenant = await prisma.tenant.findUnique({ where: { slug: "studiohub" } });
    if (!studiohubTenant) {
      console.log("  → StudioHub tenant not found, seeding database...");
      execFileSync("pnpm", ["--filter=@booking/api", "seed"], {
        cwd: ROOT_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
      studiohubTenant = await prisma.tenant.findUnique({ where: { slug: "studiohub" } });
    }
    record(
      "DATABASE",
      "StudioHub Tenant Seeded",
      Boolean(studiohubTenant),
      `Tenant ID: ${studiohubTenant?.id ?? "not found"}`,
    );
    if (!studiohubTenant) process.exit(1);
  } catch (err) {
    record("DATABASE", "StudioHub Tenant Seeded", false, err.message);
    process.exit(1);
  }

  console.log("");

  // ─── TIER 3: Local Reverse Proxy & Cloudflare Tunnel ───
  console.log("🌐 TIER 3: Webhook Capture Proxy & Public HTTPS Tunnel");

  let capturedWebhookPayload = null;

  proxyServer = http.createServer((req, res) => {
    const chunks = [];
    req.on("error", (err) => {
      console.error("  ❌ [PROXY] Request error:", err.message);
      if (!res.headersSent) res.writeHead(400);
      res.end();
    });
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (req.method === "POST" && req.url === "/webhooks/payos") {
        capturedWebhookPayload = body;
        console.log(`  📥 [PROXY] Captured PayOS incoming webhook POST /webhooks/payos (${body.length} bytes)`);
      } else {
        console.log(`  🌐 [PROXY] Forwarding ${req.method} ${req.url} (${body.length} bytes)`);
      }

      const upstreamHeaders = {
        ...req.headers,
        host: `127.0.0.1:${API_PORT}`,
        "x-forwarded-host": req.headers.host || `127.0.0.1:${API_PORT}`,
        "x-forwarded-proto": "https",
      };
      if (body.length > 0) {
        upstreamHeaders["content-length"] = String(body.length);
      } else if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") {
        delete upstreamHeaders["content-length"];
      }

      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: API_PORT,
          method: req.method,
          path: req.url,
          headers: upstreamHeaders,
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        },
      );
      upstream.on("error", (err) => {
        console.error(`  ❌ [PROXY] Upstream error for ${req.method} ${req.url}:`, err.message);
        if (!res.headersSent) res.writeHead(502);
        res.end("bad gateway");
      });
      if (body.length > 0) {
        upstream.end(body);
      } else {
        upstream.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    proxyServer.listen(PROXY_PORT, "0.0.0.0", () => {
      record("PROXY", "Local Capture Proxy", true, `Listening on 0.0.0.0:${PROXY_PORT}`);
      resolve();
    });
    proxyServer.on("error", reject);
  });

  console.log("  → Spawning Cloudflare tunnel (using HTTP/2 protocol)...");
  tunnelProc = spawn(
    cloudflaredBin,
    ["tunnel", "--protocol", "http2", "--url", `http://127.0.0.1:${PROXY_PORT}`, "--no-autoupdate"],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let publicTunnelUrl = "";

  const tunnelUrlPromise = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = chunk.toString();
      tunnelLogs.push(text);
      if (tunnelLogs.length > 60) tunnelLogs.shift();
      const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/);
      if (match && !publicTunnelUrl) {
        publicTunnelUrl = match[0];
        resolve(publicTunnelUrl);
      }
    };
    tunnelProc.stdout.on("data", onData);
    tunnelProc.stderr.on("data", onData);
    setTimeout(() => {
      if (!publicTunnelUrl) {
        reject(new Error("Timeout waiting for trycloudflare.com URL after 40s"));
      }
    }, 40000);
  });

  try {
    await tunnelUrlPromise;
    record("TUNNEL", "Cloudflare Public Tunnel", true, publicTunnelUrl);
    // Sync to .env so API loads the current live tunnel URL
    updateEnvFile("PORT", String(API_PORT));
    updateEnvFile("PUBLIC_API_URL", publicTunnelUrl);
    updateEnvFile("PAYMENTS_ENC_KEY", paymentsEncKey);
    updateEnvFile("ALLOW_MOCK_PAYMENTS", "false");
    await delay(2000);
  } catch (err) {
    record("TUNNEL", "Cloudflare Public Tunnel", false, err.message);
    console.error(tunnelLogs.join(""));
    process.exit(1);
  }

  console.log("");

  // ─── TIER 4: API Lifecycle & Readiness ───
  console.log("🚀 TIER 4: API Lifecycle & Health Readiness");

  console.log(`  → Launching NestJS API (dist/main.js) on port ${API_PORT} with PUBLIC_API_URL...`);
  const apiEntry = path.join(ROOT_DIR, "apps/api/dist/main.js");
  apiProc = spawn(process.execPath, [apiEntry], {
    cwd: path.join(ROOT_DIR, "apps/api"),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(API_PORT),
      PUBLIC_API_URL: publicTunnelUrl,
      PAYMENTS_ENC_KEY: paymentsEncKey,
      ALLOW_MOCK_PAYMENTS: "false",
      DATABASE_URL: databaseUrl,
    },
  });

  const apiLogs = [];
  apiProc.stdout.on("data", (chunk) => {
    const s = chunk.toString();
    apiLogs.push(s);
    if (apiLogs.length > 50) apiLogs.shift();
  });
  apiProc.stderr.on("data", (chunk) => {
    const s = chunk.toString();
    apiLogs.push(s);
    if (apiLogs.length > 50) apiLogs.shift();
  });

  let localReady = false;
  for (let i = 0; i < 45; i++) {
    await delay(1000);
    const res = await httpFetch({ url: `http://127.0.0.1:${API_PORT}/health/ready`, timeoutMs: 2000 });
    if (res.status === 200) {
      localReady = true;
      break;
    }
  }
  record("API", `Local API Readiness (http://127.0.0.1:${API_PORT}/health/ready)`, localReady, localReady ? "HTTP 200 OK" : "Timeout after 45s");
  if (!localReady) {
    if (apiLogs.length > 0) console.error("  📋 Startup API Logs:\n" + apiLogs.join(""));
    process.exit(1);
  }

  console.log(`  → Probing public tunnel: ${publicTunnelUrl}/health/ready ...`);
  let publicReady = false;
  let lastProbeError = "";
  for (let i = 1; i <= 60; i++) {
    await delay(1000);
    const res = await httpFetch({ url: `${publicTunnelUrl}/health/ready`, timeoutMs: 5000 });
    if (res.status === 200) {
      publicReady = true;
      break;
    }
    lastProbeError = res.status ? `HTTP ${res.status}` : res.error || "waiting";
    if (i % 5 === 0) {
      console.log(`  ... waiting for tunnel route propagation (${i}s) [latest response: ${lastProbeError}]`);
    }
  }
  record("API", `Public Tunnel Reachability (${publicTunnelUrl}/health/ready)`, publicReady, publicReady ? "HTTP 200 OK" : `Timeout after 60s (${lastProbeError})`);
  if (!publicReady) process.exit(1);

  console.log("");

  // ─── TIER 5: PayOS Gateway Smoke & Signature Verification ───
  console.log("🔐 TIER 5: Real PayOS Configuration & Webhook Confirmation");

  // Step 5.1: Owner Login
  console.log("  → Logging in as StudioHub owner (owner@studiohub.vn)...");
  const loginRes = await httpFetch({
    url: `http://127.0.0.1:${API_PORT}/auth/login`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { email: "owner@studiohub.vn", password: "demo-password" },
  });

  const cookieHeader = extractCookieHeader(loginRes);
  const loginOk = loginRes.status === 200 && cookieHeader.includes("sid=");
  record(
    "SMOKE",
    "Tenant Owner Login (owner@studiohub.vn)",
    loginOk,
    loginOk ? "Session cookie acquired (sid present)" : `HTTP ${loginRes.status} (no sid cookie)`,
  );
  if (!loginOk) process.exit(1);

  // Step 5.2: Write PayOS Config
  console.log("  → Writing tenant PayOS gateway credentials...");
  const putConfigRes = await httpFetch({
    url: `http://127.0.0.1:${API_PORT}/tenant/gateway-config`,
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": studiohubTenant.id,
      cookie: cookieHeader,
    },
    body: {
      gateway: "payos",
      environment: "production",
      credentials: {
        clientId,
        apiKey,
        checksumKey,
      },
    },
  });
  record("SMOKE", "PUT /tenant/gateway-config (PayOS)", putConfigRes.status === 200, `HTTP ${putConfigRes.status}`);
  if (putConfigRes.status !== 200) {
    if (putConfigRes.body) console.error("  ❌ PUT Error Body:", putConfigRes.body);
    process.exit(1);
  }

  // Step 5.3: Read Config & Check Redaction
  console.log("  → Reading back gateway config & checking redaction...");
  const getConfigRes = await httpFetch({
    url: `http://127.0.0.1:${API_PORT}/tenant/gateway-config`,
    method: "GET",
    headers: {
      "x-tenant-id": studiohubTenant.id,
      cookie: cookieHeader,
    },
  });

  const rawConfigStr = getConfigRes.body || "";
  const parsedConfigs = Array.isArray(getConfigRes.json) ? getConfigRes.json : [];
  const payosActive = parsedConfigs.some((item) => item?.gateway === "payos" && item?.isActive === true);
  const leakedSecret = [clientId, apiKey, checksumKey].some((s) => s && rawConfigStr.includes(s));

  record(
    "SMOKE",
    "GET /tenant/gateway-config Redaction",
    payosActive && !leakedSecret,
    payosActive && !leakedSecret
      ? "PayOS active & zero secret leakage"
      : `active: ${payosActive}, leaked: ${leakedSecret}`,
  );
  if (!payosActive || leakedSecret) process.exit(1);

  // Step 5.4: Confirm Webhook with PayOS via API
  console.log("  → Calling POST /tenant/gateway-config/payos/confirm-webhook...");
  const confirmRes = await httpFetch({
    url: `http://127.0.0.1:${API_PORT}/tenant/gateway-config/payos/confirm-webhook`,
    method: "POST",
    headers: {
      "x-tenant-id": studiohubTenant.id,
      cookie: cookieHeader,
    },
    timeoutMs: 30000,
  });

  const expectedWebhookUrl = `${publicTunnelUrl}/webhooks/payos`;
  const confirmVerified =
    (confirmRes.status === 200 || confirmRes.status === 201) &&
    confirmRes.json?.verified === true &&
    confirmRes.json?.webhookUrl === expectedWebhookUrl;

  record(
    "SMOKE",
    "POST /tenant/gateway-config/payos/confirm-webhook",
    confirmVerified,
    confirmVerified
      ? `PayOS confirmed webhook URL: ${confirmRes.json?.webhookUrl}`
      : `HTTP ${confirmRes.status}, verified: ${confirmRes.json?.verified}, url: ${confirmRes.json?.webhookUrl}`,
  );
  if (!confirmVerified) {
    if (confirmRes.body) console.error("  ❌ Confirm Webhook Error Body:", confirmRes.body);
    if (apiLogs.length > 0) {
      console.error("  📋 Recent API Logs:\n" + apiLogs.join(""));
    }
    process.exit(1);
  }

  // Step 5.5: Await Incoming Sample Webhook from PayOS
  console.log("  → Waiting for PayOS sample webhook delivery on /webhooks/payos...");
  for (let i = 0; i < 20; i++) {
    if (capturedWebhookPayload && capturedWebhookPayload.length > 0) break;
    await delay(1000);
  }

  const sampleCaptured = Boolean(capturedWebhookPayload && capturedWebhookPayload.length > 0);
  record(
    "SMOKE",
    "PayOS Sample Webhook Delivery",
    sampleCaptured,
    sampleCaptured
      ? `Received raw payload (${capturedWebhookPayload.length} bytes)`
      : "No sample webhook received within 20s",
  );
  if (!sampleCaptured) process.exit(1);

  // Step 5.6: Verify Sample Webhook Signature
  let sampleParsed = null;
  let signatureValid = false;
  try {
    sampleParsed = JSON.parse(capturedWebhookPayload.toString("utf8"));
    if (sampleParsed && sampleParsed.data && sampleParsed.signature) {
      const expectedSig = signedPayload(sampleParsed.data, checksumKey);
      signatureValid = safeHexEqual(expectedSig, sampleParsed.signature);
    }
  } catch (err) {
    signatureValid = false;
  }

  record(
    "SMOKE",
    "PayOS Sample HMAC-SHA256 Signature Verification",
    signatureValid,
    signatureValid
      ? `Signature verified with PAYOS_CHECKSUM_KEY (code: ${sampleParsed?.data?.code ?? "unknown"})`
      : "Signature mismatch or malformed webhook payload",
  );

  await prisma.$disconnect();

  // ─── SUMMARY ───
  console.log("\n========================================================================");
  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  console.log(`                     SMOKE RESULT: ${passedCount} / ${totalCount} CHECKS PASSED`);
  if (passedCount === totalCount) {
    console.log("           🎉 PAYOS REAL-CHANNEL LOCAL SMOKE COMPLETED SUCCESSFULLY!");
  } else {
    console.log(`           ⚠️  ${totalCount - passedCount} CHECKS FAILED`);
  }
  console.log("========================================================================\n");

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("\n❌ Fatal smoke error:", err);
    process.exit(1);
  })
  .finally(() => {
    cleanup();
  });
