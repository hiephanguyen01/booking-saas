import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { LegalDocumentType, Locale } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { REQUIRED_DOC_TYPES } from '../../domain/legal-document-type';
import { LEGAL_TEMPLATES } from '../../domain/templates';
import type {
  DocumentRow,
  ILegalDocumentRepository,
  PublishData,
  TranslationRow,
  UpsertDraftData,
  VersionRow,
} from '../../domain/ports/legal-document-repository.port';

const translationInclude = {
  translations: true,
} as const;

const versionsInclude = {
  versions: { include: translationInclude },
} as const;

type VersionPayload = Prisma.LegalDocumentVersionGetPayload<{ include: typeof translationInclude }>;
type DocumentPayload = Prisma.LegalDocumentGetPayload<{ include: typeof versionsInclude }>;

function toTranslationRow(t: { locale: string; title: string; bodyMd: string }): TranslationRow {
  return { locale: t.locale, title: t.title, bodyMd: t.bodyMd };
}

function toVersionRow(v: VersionPayload): VersionRow {
  return {
    id: v.id,
    versionNo: v.versionNo,
    isMaterialChange: v.isMaterialChange,
    publishedAt: v.publishedAt,
    translations: v.translations.map(toTranslationRow),
  };
}

function toDocumentRow(d: DocumentPayload): DocumentRow {
  return {
    id: d.id,
    docType: d.docType,
    currentVersionId: d.currentVersionId,
    versions: d.versions.map(toVersionRow),
  };
}

/**
 * Straightforward Prisma against the three legal models (§ tenant legal
 * documents). Two invariants this class must never break:
 *   - a draft (published_at IS NULL) is unique per document — the partial
 *     unique index `legal_document_versions_draft_key` enforces it in the DB,
 *     `upsertDraft` clears the existing draft before inserting so the insert
 *     never trips it;
 *   - a published version's `body_md` is never rewritten — `publish` only ever
 *     touches `version_no` (see note below), `is_material_change`,
 *     `published_at` and `published_by_user_id`.
 *
 * A draft has no real version number yet — `version_no` is NOT NULL, so it is
 * seeded with the sentinel `0`, which never collides with a published version
 * (those start at 1 via `LegalDocument.nextVersionNo`). `publish()` overwrites
 * the sentinel with the real number computed by the use-case.
 */
@Injectable()
export class PrismaLegalDocumentRepository implements ILegalDocumentRepository {
  async listAll(tx: PrismaTx, tenantId: string): Promise<DocumentRow[]> {
    const rows = await tx.legalDocument.findMany({
      where: { tenantId },
      include: versionsInclude,
      orderBy: { docType: 'asc' },
    });
    return rows.map(toDocumentRow);
  }

  async findByType(
    tx: PrismaTx,
    tenantId: string,
    docType: LegalDocumentType,
  ): Promise<DocumentRow | null> {
    const row = await tx.legalDocument.findUnique({
      where: { tenantId_docType: { tenantId, docType } },
      include: versionsInclude,
    });
    return row ? toDocumentRow(row) : null;
  }

  async findVersionById(
    tx: PrismaTx,
    versionId: string,
  ): Promise<(VersionRow & { docType: LegalDocumentType }) | null> {
    const row = await tx.legalDocumentVersion.findUnique({
      where: { id: versionId },
      include: { ...translationInclude, document: { select: { docType: true } } },
    });
    return row ? { ...toVersionRow(row), docType: row.document.docType } : null;
  }

  async upsertDraft(tx: PrismaTx, data: UpsertDraftData): Promise<string> {
    const document = await tx.legalDocument.upsert({
      where: { tenantId_docType: { tenantId: data.tenantId, docType: data.docType } },
      create: { tenantId: data.tenantId, docType: data.docType },
      update: {},
    });

    // At most one draft per document — clear it before inserting so the
    // partial unique index (`published_at IS NULL`) never trips. Cascades to
    // its translations.
    await tx.legalDocumentVersion.deleteMany({
      where: { documentId: document.id, publishedAt: null },
    });

    await tx.legalDocumentVersion.create({
      data: {
        tenantId: data.tenantId,
        documentId: document.id,
        versionNo: 0,
        translations: {
          create: data.translations.map((t) => ({
            tenantId: data.tenantId,
            locale: t.locale,
            title: t.title,
            bodyMd: t.bodyMd,
          })),
        },
      },
    });
    return document.id;
  }

  async publish(tx: PrismaTx, data: PublishData): Promise<void> {
    await tx.legalDocumentVersion.updateMany({
      where: { id: data.draftVersionId, tenantId: data.tenantId },
      data: {
        versionNo: data.versionNo,
        isMaterialChange: data.isMaterialChange,
        publishedAt: new Date(),
        publishedByUserId: data.publishedByUserId,
      },
    });
    await tx.legalDocument.updateMany({
      where: { id: data.documentId, tenantId: data.tenantId },
      data: { currentVersionId: data.draftVersionId },
    });
  }

  async withdraw(tx: PrismaTx, tenantId: string, documentId: string): Promise<void> {
    await tx.legalDocument.updateMany({
      where: { id: documentId, tenantId },
      data: { currentVersionId: null },
    });
  }

  async addTranslation(
    tx: PrismaTx,
    tenantId: string,
    versionId: string,
    row: TranslationRow,
  ): Promise<void> {
    await tx.legalDocumentTranslation.create({
      data: { tenantId, versionId, locale: row.locale, title: row.title, bodyMd: row.bodyMd },
    });
  }

  /**
   * Used by create-tenant (via the `tenant.created` handler, D10) and the demo
   * seed. Never clobbers a document that already has a version — re-running
   * the seed against a tenant an owner has started authoring must be a no-op.
   */
  async seedDrafts(tx: PrismaTx, tenantId: string, locales: readonly Locale[]): Promise<void> {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const tenantName = tenant?.name ?? '';

    for (const docType of REQUIRED_DOC_TYPES) {
      const document = await tx.legalDocument.upsert({
        where: { tenantId_docType: { tenantId, docType } },
        create: { tenantId, docType },
        update: {},
      });

      const existingVersion = await tx.legalDocumentVersion.findFirst({
        where: { documentId: document.id },
        select: { id: true },
      });
      if (existingVersion) continue;

      const template = LEGAL_TEMPLATES[docType];
      await tx.legalDocumentVersion.create({
        data: {
          tenantId,
          documentId: document.id,
          versionNo: 0,
          translations: {
            create: locales
              .filter((locale) => template[locale] !== undefined)
              .map((locale) => ({
                tenantId,
                locale,
                title: template[locale].title.replaceAll('{{tenantName}}', tenantName),
                bodyMd: template[locale].bodyMd.replaceAll('{{tenantName}}', tenantName),
              })),
          },
        },
      });
    }
  }
}
