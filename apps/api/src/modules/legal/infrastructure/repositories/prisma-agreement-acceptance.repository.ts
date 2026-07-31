import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LegalDocumentType } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AcceptanceRow,
  IAgreementAcceptanceRepository,
  PendingRow,
  RecordAcceptanceData,
} from '../../domain/ports/agreement-acceptance-repository.port';

const select = {
  agreementType: true,
  version: true,
  documentVersionId: true,
  acceptedLocale: true,
  acceptedAt: true,
} as const;

type Row = Prisma.AgreementAcceptanceGetPayload<{ select: typeof select }>;

function toRow(row: Row): AcceptanceRow {
  return {
    agreementType: row.agreementType,
    version: row.version,
    documentVersionId: row.documentVersionId,
    acceptedLocale: row.acceptedLocale,
    acceptedAt: row.acceptedAt,
  };
}

/**
 * Legal-owned proof-of-acceptance repository (§ tenant legal documents). `record`,
 * `listByUser` and `listByPartner` are plain Prisma; `pendingTypes` is raw SQL
 * because the rule — max accepted version_no vs. max material version_no, per
 * doc_type — is a max-vs-max comparison across a join that Prisma's aggregates
 * cannot express in one round trip. Raw SQL in a repository adapter is
 * sanctioned by `apps/api/CLAUDE.md`; it is forbidden only in application code.
 */
@Injectable()
export class PrismaAgreementAcceptanceRepository implements IAgreementAcceptanceRepository {
  async record(tx: PrismaTx, data: RecordAcceptanceData): Promise<void> {
    await tx.agreementAcceptance.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        partnerId: data.partnerId ?? null,
        agreementType: data.agreementType,
        documentVersionId: data.documentVersionId ?? null,
        acceptedLocale: data.acceptedLocale ?? null,
        version: data.version,
        ip: data.ip ?? null,
      },
    });
  }

  /**
   * The rule is max-vs-max across a join, which Prisma's aggregates cannot
   * express in one round trip (verified: there is no `_max` usage anywhere in
   * `apps/api/src`). `forTenant` already set the GUC on this `tx`, and the RLS
   * policies on all three tables apply to `$queryRaw` on that same transaction
   * — do not add a `tenant_id = …` predicate and do not touch
   * `this.prisma.app`/`.admin`.
   */
  async pendingTypes(
    tx: PrismaTx,
    userId: string,
    types: readonly LegalDocumentType[],
    partnerId?: string | null,
  ): Promise<PendingRow[]> {
    if (types.length === 0) return [];
    const partnerFilter = partnerId ? Prisma.sql`AND a.partner_id = ${partnerId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<
      Array<{ doc_type: LegalDocumentType; document_id: string; version_id: string; version_no: number }>
    >(Prisma.sql`
      WITH accepted AS (
        SELECT d.doc_type, max(v.version_no) AS accepted_no
        FROM agreement_acceptances a
        JOIN legal_document_versions v ON v.id = a.document_version_id
        JOIN legal_documents d ON d.id = v.document_id
        WHERE a.user_id = ${userId}::uuid ${partnerFilter}
        GROUP BY d.doc_type
      ),
      material AS (
        SELECT DISTINCT ON (d.doc_type)
               d.doc_type, d.id AS document_id, v.id AS version_id, v.version_no
        FROM legal_document_versions v
        JOIN legal_documents d ON d.id = v.document_id
        WHERE v.is_material_change = true AND v.published_at IS NOT NULL
        ORDER BY d.doc_type, v.version_no DESC
      )
      SELECT m.doc_type::text AS doc_type, m.document_id, m.version_id, m.version_no
      FROM material m
      LEFT JOIN accepted a ON a.doc_type = m.doc_type
      WHERE m.doc_type = ANY(ARRAY[${Prisma.join(types)}]::legal_document_type[])
        AND (a.accepted_no IS NULL OR a.accepted_no < m.version_no)
      ORDER BY m.doc_type`);
    return rows.map((r) => ({
      docType: r.doc_type,
      documentId: r.document_id,
      versionId: r.version_id,
      versionNo: r.version_no,
    }));
  }

  async listByUser(tx: PrismaTx, userId: string): Promise<AcceptanceRow[]> {
    const rows = await tx.agreementAcceptance.findMany({
      where: { userId },
      select,
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async listByPartner(tx: PrismaTx, partnerId: string): Promise<AcceptanceRow[]> {
    const rows = await tx.agreementAcceptance.findMany({
      where: { partnerId },
      select,
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map(toRow);
  }
}
