import { createHash } from 'node:crypto';
import type { SessionInfoResponse } from '@booking/contracts';

const SNAPSHOT_TTL_MS = 5_000;
const MAX_SNAPSHOT_ENTRIES = 2_000;

interface SessionProbeResult {
  ok: boolean;
  status: number;
  data: SessionInfoResponse | null;
}

interface SessionSnapshot {
  tokenDigest: string;
  expiresAt: number;
  sequence: number;
  info: SessionInfoResponse;
}

const snapshots = new Map<string, SessionSnapshot>();
const inFlightProbes = new Map<string, Promise<SessionProbeResult>>();
let probeSequence = 0;

function credentialDigest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function snapshotKey(tenantId: string, sessionId: string): string {
  return `${tenantId}:${credentialDigest(sessionId)}`;
}

function cachedSnapshot(key: string, digest: string): SessionInfoResponse | null {
  const snapshot = snapshots.get(key);
  if (!snapshot || snapshot.tokenDigest !== digest) return null;
  if (snapshot.expiresAt > Date.now()) return snapshot.info;
  snapshots.delete(key);
  return null;
}

function pruneSnapshots(): void {
  if (snapshots.size < MAX_SNAPSHOT_ENTRIES) return;

  const now = Date.now();
  for (const [key, snapshot] of snapshots) {
    if (snapshot.expiresAt <= now) snapshots.delete(key);
  }
  while (snapshots.size >= MAX_SNAPSHOT_ENTRIES) {
    const oldest = snapshots.keys().next().value as string | undefined;
    if (!oldest) return;
    snapshots.delete(oldest);
  }
}

function storeSnapshot(
  key: string,
  digest: string,
  info: SessionInfoResponse,
  sequence: number,
): void {
  const current = snapshots.get(key);
  // A slower probe for an older token must never replace a snapshot created by
  // a newer token probe that started after it.
  if (current && current.sequence > sequence) return;

  if (current) snapshots.delete(key);
  pruneSnapshots();
  snapshots.set(key, {
    tokenDigest: digest,
    expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    sequence,
    info,
  });
}

function invalidateSnapshot(key: string, digest: string): void {
  if (snapshots.get(key)?.tokenDigest === digest) snapshots.delete(key);
}

export async function loadAuthSessionSnapshot({
  tenantId,
  sessionId,
  accessToken,
  probe,
}: {
  tenantId: string;
  sessionId: string;
  accessToken: string;
  probe: () => Promise<SessionProbeResult>;
}): Promise<SessionProbeResult> {
  const key = snapshotKey(tenantId, sessionId);
  const digest = credentialDigest(accessToken);
  const cached = cachedSnapshot(key, digest);
  if (cached) return { ok: true, status: 200, data: cached };

  const inFlightKey = `${key}:${digest}`;
  const existing = inFlightProbes.get(inFlightKey);
  if (existing) return existing;

  const sequence = ++probeSequence;
  const pending = probe().then((result) => {
    if (result.ok && result.data) {
      storeSnapshot(key, digest, result.data, sequence);
    } else {
      invalidateSnapshot(key, digest);
    }
    return result;
  });
  inFlightProbes.set(inFlightKey, pending);

  try {
    return await pending;
  } finally {
    if (inFlightProbes.get(inFlightKey) === pending) inFlightProbes.delete(inFlightKey);
  }
}
