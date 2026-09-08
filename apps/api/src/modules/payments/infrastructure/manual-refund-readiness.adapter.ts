import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type {
  ManualRefundReadinessCheck,
  ManualRefundReadinessPort,
} from '../domain/ports/manual-refund-readiness.port';

function decode32ByteSecret(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const secret = Buffer.from(value, 'base64');
  if (secret.length !== 32) return null;
  return secret;
}

interface TableExistsRow {
  exists: boolean;
}

interface IndexNameRow {
  indexname: string;
}

interface PermissionKeyRow {
  key: string;
}

interface RolePermissionRow {
  role_name: string;
  scope_level: string;
  permission_key: string;
}

@Injectable()
export class ManualRefundReadinessAdapter implements ManualRefundReadinessPort {
  constructor(private readonly prisma: PrismaService) {}

  async inspect(_tenantId: string): Promise<ManualRefundReadinessCheck[]> {
    const checks: ManualRefundReadinessCheck[] = [];

    // 1. PII Keyring check
    const rawKeyring = process.env.MANUAL_REFUND_PII_KEYRING;
    const decodedKeys = new Map<string, Buffer>();
    let keyringOk = true;

    if (!rawKeyring) {
      checks.push({ key: 'pii_keyring', ok: false, reason: 'missing_keyring' });
      keyringOk = false;
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawKeyring);
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        checks.push({ key: 'pii_keyring', ok: false, reason: 'invalid_keyring' });
        keyringOk = false;
      } else {
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (entries.length === 0) {
          checks.push({ key: 'pii_keyring', ok: false, reason: 'empty_keyring' });
          keyringOk = false;
        } else {
          let keysValid = true;
          for (const [version, key] of entries) {
            if (typeof key !== 'string') {
              keysValid = false;
              break;
            }
            const buf = decode32ByteSecret(key);
            if (!buf) {
              keysValid = false;
              break;
            }
            decodedKeys.set(version, buf);
          }
          if (!keysValid) {
            checks.push({ key: 'pii_keyring', ok: false, reason: 'invalid_keyring_keys' });
            keyringOk = false;
          } else {
            checks.push({ key: 'pii_keyring', ok: true });
          }
        }
      }
    }

    // 2. PII Active Key check
    const activeKeyVersion = process.env.MANUAL_REFUND_PII_ACTIVE_KEY_VERSION?.trim();
    if (!activeKeyVersion || !/^[A-Za-z0-9._-]{1,40}$/.test(activeKeyVersion)) {
      checks.push({ key: 'pii_active_key', ok: false, reason: 'missing_active_key' });
    } else if (!keyringOk || !decodedKeys.has(activeKeyVersion)) {
      checks.push({ key: 'pii_active_key', ok: false, reason: 'active_key_not_in_keyring' });
    } else {
      checks.push({ key: 'pii_active_key', ok: true });
    }

    // 3. PII Fingerprint Key check
    const rawFingerprintKey = process.env.MANUAL_REFUND_PII_FINGERPRINT_KEY;
    if (!rawFingerprintKey) {
      checks.push({ key: 'pii_fingerprint_key', ok: false, reason: 'missing_fingerprint_key' });
    } else {
      const fingerprintBuf = decode32ByteSecret(rawFingerprintKey);
      if (!fingerprintBuf) {
        checks.push({ key: 'pii_fingerprint_key', ok: false, reason: 'invalid_fingerprint_key' });
      } else {
        let matchesEncryptionKey = false;
        for (const [, encBuf] of decodedKeys) {
          if (timingSafeEqual(fingerprintBuf, encBuf)) {
            matchesEncryptionKey = true;
            break;
          }
        }
        if (matchesEncryptionKey) {
          checks.push({
            key: 'pii_fingerprint_key',
            ok: false,
            reason: 'fingerprint_key_matches_encryption_key',
          });
        } else {
          checks.push({ key: 'pii_fingerprint_key', ok: true });
        }
      }
    }

    // 4. Private Storage check (non-mutating capability check)
    const bucket = process.env.S3_BUCKET ?? 'bookingos';
    const privateBucket = process.env.S3_PRIVATE_BUCKET ?? `${bucket}-private`;
    const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
    const accessKey = process.env.S3_ACCESS_KEY ?? 'minio';
    const secretKey = process.env.S3_SECRET_KEY ?? 'minio12345';

    if (
      !privateBucket ||
      privateBucket === bucket ||
      !endpoint ||
      !accessKey ||
      !secretKey
    ) {
      checks.push({ key: 'private_storage', ok: false, reason: 'misconfigured_private_storage' });
    } else {
      checks.push({ key: 'private_storage', ok: true });
    }

    // 5. Schema check (read-only query)
    try {
      const tableRows = await this.prisma.admin.$queryRaw<TableExistsRow[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'manual_refund_operations'
        ) as "exists"
      `;
      const indexRows = await this.prisma.admin.$queryRaw<IndexNameRow[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'manual_refund_operations'
      `;
      const existingIndexes = new Set(indexRows.map((r: IndexNameRow) => r.indexname));
      const requiredIndexes = [
        'manual_refund_operations_pkey',
        'manual_refund_operations_refund_batch_id_key',
        'manual_refund_operations_tenant_id_refund_batch_id_key',
        'manual_refund_operations_tenant_transfer_reference_key',
        'manual_refund_operations_tenant_id_status_updated_at_idx',
        'manual_refund_operations_tenant_id_maker_user_id_status_idx',
        'manual_refund_operations_tenant_id_transfer_due_at_idx',
      ];
      const missingIndexes = requiredIndexes.filter((idx) => !existingIndexes.has(idx));
      if (!tableRows[0]?.exists || missingIndexes.length > 0) {
        checks.push({ key: 'schema', ok: false, reason: 'missing_schema' });
      } else {
        checks.push({ key: 'schema', ok: true });
      }
    } catch {
      checks.push({ key: 'schema', ok: false, reason: 'missing_schema' });
    }

    // 6. System Role Permissions check (read-only query)
    try {
      const permRows = await this.prisma.admin.$queryRaw<PermissionKeyRow[]>`
        SELECT key FROM permissions WHERE key IN (
          'platform.refunds.break_glass',
          'tenant.refunds.prepare',
          'tenant.refunds.approve',
          'tenant.refunds.reveal'
        )
      `;
      const foundPerms = new Set(permRows.map((r: PermissionKeyRow) => r.key));
      const rolePermRows = await this.prisma.admin.$queryRaw<RolePermissionRow[]>`
        SELECT r.name as "role_name", r.scope_level, rp.permission_key
        FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.is_system = true AND rp.permission_key IN (
          'platform.refunds.break_glass',
          'tenant.refunds.prepare',
          'tenant.refunds.approve',
          'tenant.refunds.reveal'
        )
      `;

      const superAdminHasBreakGlass = rolePermRows.some(
        (rp: RolePermissionRow) =>
          rp.role_name === 'Super Admin' &&
          rp.scope_level === 'platform' &&
          rp.permission_key === 'platform.refunds.break_glass',
      );

      const tenantRoles = ['Tenant Owner', 'Manager', 'Finance'];
      const tenantPerms = ['tenant.refunds.prepare', 'tenant.refunds.approve', 'tenant.refunds.reveal'];
      const tenantRolesOk = tenantRoles.every((roleName) =>
        tenantPerms.every((perm) =>
          rolePermRows.some(
            (rp: RolePermissionRow) =>
              rp.role_name === roleName &&
              rp.scope_level === 'tenant' &&
              rp.permission_key === perm,
          ),
        ),
      );

      if (foundPerms.size < 4 || !superAdminHasBreakGlass || !tenantRolesOk) {
        checks.push({
          key: 'system_role_permissions',
          ok: false,
          reason: 'missing_permissions',
        });
      } else {
        checks.push({ key: 'system_role_permissions', ok: true });
      }
    } catch {
      checks.push({
        key: 'system_role_permissions',
        ok: false,
        reason: 'missing_permissions',
      });
    }

    // 7. Worker enabled check
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') {
      checks.push({ key: 'worker_enabled', ok: false, reason: 'worker_disabled' });
    } else {
      checks.push({ key: 'worker_enabled', ok: true });
    }

    return checks;
  }
}
