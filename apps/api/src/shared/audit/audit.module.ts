import { Global, Module } from '@nestjs/common';
import { AUDIT_WRITER } from './audit-writer.port';
import { PrismaAuditWriter } from './prisma-audit-writer';

/**
 * Shared audit trail (§14.4). Global so any module can inject `AUDIT_WRITER`
 * without importing this module — the same pattern as object storage. The writer
 * is stateless; it writes on whatever tx handle the caller passes.
 */
@Global()
@Module({
  providers: [{ provide: AUDIT_WRITER, useClass: PrismaAuditWriter }],
  exports: [AUDIT_WRITER],
})
export class AuditModule {}
