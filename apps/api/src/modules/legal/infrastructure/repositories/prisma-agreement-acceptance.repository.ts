import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LegalDocumentType } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AcceptanceRow,
  AgreementTypeKey,
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

/** The agreement types that are backed by a `legal_documents` row. */
const DOCUMENT_AGREEMENT_TYPES = [
  'customer_terms',
  'privacy_policy',
  'partner_terms',
  'affiliate_terms',
] as const satisfies readonly AgreementTypeKey[];

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
   *
   * Two things this query deliberately separates, because conflating them
   * deadlocked the whole re-acceptance flow:
   *
   *   - the **trigger** is the material watermark — `max(version_no)` over the
   *     published versions marked `is_material_change`, per the design's
   *     `pending ⟺ accepted_no < material_no` rule, so a cosmetic republish
   *     drags nobody through an acceptance screen;
   *   - the **thing to sign** is the document's `current_version_id` — the text
   *     actually in force. Returning the material version id instead handed the
   *     accept endpoint an id it provably rejects (it validates against
   *     `current_version_id`), which made the pending state unclearable the
   *     moment a cosmetic publish followed a material one.
   *
   * A withdrawn document (`current_version_id IS NULL`) drops out of the join
   * and is never reported pending: nobody can sign a document the tenant has
   * taken offline, and the storefront is dark anyway.
   */
  async pendingTypes(
    tx: PrismaTx,
    userId: string,
    types: readonly LegalDocumentType[],
    partnerId?: string | null,
  ): Promise<PendingRow[]> {
    if (types.length === 0) return [];
    // A partner-scoped acceptance narrows to that org, but a user-scoped row
    // (partner_id NULL — what the self-service `POST /me/legal/accept` writes
    // when the caller has no verified partner scope) counts for every org the
    // person acts in. The person is who signed; the org is provenance. Read and
    // write must never disagree about this, or the guard blocks forever.
    const partnerFilter = partnerId
      ? Prisma.sql`AND (a.partner_id = ${partnerId}::uuid OR a.partner_id IS NULL)`
      : Prisma.empty;
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
        SELECT d.doc_type, max(v.version_no) AS material_no
        FROM legal_document_versions v
        JOIN legal_documents d ON d.id = v.document_id
        WHERE v.is_material_change = true AND v.published_at IS NOT NULL
        GROUP BY d.doc_type
      )
      SELECT d.doc_type::text AS doc_type, d.id AS document_id,
             cur.id AS version_id, cur.version_no
      FROM legal_documents d
      JOIN legal_document_versions cur
        ON cur.id = d.current_version_id AND cur.published_at IS NOT NULL
      JOIN material m ON m.doc_type = d.doc_type
      LEFT JOIN accepted a ON a.doc_type = d.doc_type
      WHERE d.doc_type = ANY(ARRAY[${Prisma.join(types)}]::legal_document_type[])
        AND (a.accepted_no IS NULL OR a.accepted_no < m.material_no)
      ORDER BY d.doc_type`);
    return rows.map((r) => ({
      docType: r.doc_type,
      documentId: r.document_id,
      versionId: r.version_id,
      versionNo: r.version_no,
    }));
  }

  /**
   * The self-service "terms I agreed to" history. Restricted to the four
   * document types on purpose: `commission_schedule` rows are stamped with the
   * tenant staff member who clicked approve (out of scope to version — design
   * §Out of scope), so leaving them in listed a tenant operator's own approvals
   * back to them as terms they personally signed, with no document behind any
   * of them. `listByPartner` still returns them for the partner agreements page.
   */
  async listByUser(tx: PrismaTx, userId: string): Promise<AcceptanceRow[]> {
    const rows = await tx.agreementAcceptance.findMany({
      where: { userId, agreementType: { in: [...DOCUMENT_AGREEMENT_TYPES] } },
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
