import type { Locale, LegalDocumentType } from '@booking/contracts';
import { LegalDocument } from '../../src/modules/legal/domain/entities/legal-document.entity';
import { REQUIRED_DOC_TYPES } from '../../src/modules/legal/domain/legal-document-type';
import { LEGAL_TEMPLATES } from '../../src/modules/legal/domain/templates';
import { prisma } from './client';

/** Both locales the shipped templates cover — matches `SeedTenantLegalDraftsUseCase`. */
const SEED_LOCALES: readonly Locale[] = ['vi', 'en'];

export type PublishedLegalVersions = Record<LegalDocumentType, string>;

/**
 * Seeds the four required legal documents as DRAFTS for a tenant, substituting
 * `{{tenantName}}` into `LEGAL_TEMPLATES`.
 *
 * This deliberately duplicates
 * `PrismaLegalDocumentRepository.seedDrafts`/`SeedTenantLegalDraftsUseCase`
 * (`src/modules/legal/{infrastructure/repositories/prisma-legal-document.repository.ts,application/use-cases/seed-tenant-legal-drafts.use-case.ts}`)
 * rather than calling them: that use-case needs `TenantDbService` (Nest DI +
 * a request-scoped `forTenant` transaction), which does not exist in this plain
 * ts-node script. Every seed file in this directory follows the same rule —
 * hit `prisma` (the migrate connection, which bypasses RLS — see `./client.ts`)
 * directly instead of instantiating application/use-case classes.
 *
 * Never clobbers a document that already has a version — re-running the seed
 * against a tenant an owner has started authoring is a no-op. Called for BOTH
 * seed scopes: `SEED_SCOPE=tenants` stops here (drafts only, storefront stays
 * dark, a real owner must publish); the dev/staging default goes on to
 * `publishTenantLegalDocuments` below.
 */
export async function seedTenantLegalDrafts(tenantId: string, tenantName: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
            create: SEED_LOCALES.filter((locale) => template[locale] !== undefined).map((locale) => ({
              tenantId,
              locale,
              title: template[locale].title.replaceAll('{{tenantName}}', tenantName),
              bodyMd: template[locale].bodyMd.replaceAll('{{tenantName}}', tenantName),
            })),
          },
        },
      });
    }
  });
}

/**
 * Publishes the tenant's draft for all four required documents and stamps
 * `tenants.legal_ready_at` / `legal_documents_ready`, so `pnpm dev` never
 * brings up a dark demo storefront. Mirrors `PublishLegalDocumentUseCase` +
 * the `legal.readiness_changed` outbox handler that would normally write
 * those two columns — duplicated here for the same reason as
 * `seedTenantLegalDrafts`: neither a `forTenant` transaction nor the outbox
 * relay run inside this script.
 *
 * dev/staging ONLY — `SEED_SCOPE=tenants` must never call this: auto-publishing
 * on the owner's behalf would make the storefront gate decorative.
 *
 * Idempotent: a document whose `current_version_id` is already set is left
 * untouched (its one draft row became that published version in place — see
 * `PrismaLegalDocumentRepository.publish` — so a second run finds no draft
 * left to publish).
 */
export async function publishTenantLegalDocuments(input: {
  tenantId: string;
  tenantName: string;
  defaultLocale: Locale;
  publishedByUserId: string;
}): Promise<PublishedLegalVersions> {
  await seedTenantLegalDrafts(input.tenantId, input.tenantName);

  const publishedVersionIds = {} as PublishedLegalVersions;

  await prisma.$transaction(async (tx) => {
    for (const docType of REQUIRED_DOC_TYPES) {
      const document = await tx.legalDocument.findUniqueOrThrow({
        where: { tenantId_docType: { tenantId: input.tenantId, docType } },
        include: { versions: { include: { translations: true } } },
      });

      if (document.currentVersionId) {
        publishedVersionIds[docType] = document.currentVersionId;
        continue;
      }

      const draft = document.versions.find((v) => v.publishedAt === null);
      if (!draft) {
        throw new Error(
          `Seed: tenant ${input.tenantId} document ${docType} has neither a draft nor a published version`,
        );
      }

      LegalDocument.assertPublishable(
        draft.translations.map((t) => t.locale),
        input.defaultLocale,
      );

      const versionNo = LegalDocument.nextVersionNo(
        document.versions
          .filter((v) => v.publishedAt !== null)
          .map((v) => ({
            versionNo: v.versionNo,
            publishedAt: v.publishedAt,
            isMaterialChange: v.isMaterialChange,
            locales: v.translations.map((t) => t.locale),
          })),
      );

      await tx.legalDocumentVersion.update({
        where: { id: draft.id },
        data: {
          versionNo,
          isMaterialChange: false,
          publishedAt: new Date(),
          publishedByUserId: input.publishedByUserId,
        },
      });
      await tx.legalDocument.update({
        where: { id: document.id },
        data: { currentVersionId: draft.id },
      });

      publishedVersionIds[docType] = draft.id;
    }

    await tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        legalReadyAt: new Date(),
        legalDocumentsReady: REQUIRED_DOC_TYPES.length,
      },
    });
  });

  return publishedVersionIds;
}
