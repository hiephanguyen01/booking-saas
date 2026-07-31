import type { LegalDocumentType, Locale } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LEGAL_DOCUMENT_REPOSITORY = Symbol('LEGAL_DOCUMENT_REPOSITORY');

export interface TranslationRow {
  locale: string;
  title: string;
  bodyMd: string;
}

export interface VersionRow {
  id: string;
  versionNo: number;
  isMaterialChange: boolean;
  publishedAt: Date | null;
  translations: TranslationRow[];
}

export interface DocumentRow {
  id: string;
  docType: LegalDocumentType;
  currentVersionId: string | null;
  versions: VersionRow[];
}

export interface UpsertDraftData {
  tenantId: string;
  docType: LegalDocumentType;
  translations: readonly TranslationRow[];
}

export interface PublishData {
  tenantId: string;
  documentId: string;
  draftVersionId: string;
  versionNo: number;
  isMaterialChange: boolean;
  publishedByUserId: string | null;
}

export interface ILegalDocumentRepository {
  /** Every document of the tenant with all versions + translations. */
  listAll(tx: PrismaTx, tenantId: string): Promise<DocumentRow[]>;
  findByType(tx: PrismaTx, tenantId: string, docType: LegalDocumentType): Promise<DocumentRow | null>;
  findVersionById(tx: PrismaTx, versionId: string): Promise<(VersionRow & { docType: LegalDocumentType }) | null>;
  /** Creates the document row if missing; replaces the single draft. */
  upsertDraft(tx: PrismaTx, data: UpsertDraftData): Promise<string>;
  /**
   * Stamps published_at and repoints current_version_id. Guarded on the version
   * still being a draft, so two concurrent publishes cannot both stamp the same
   * row (the second would rewrite `published_at` and `is_material_change` on an
   * already-published version — silently retracting or imposing a re-acceptance
   * requirement). Returns false when the draft was already published.
   */
  publish(tx: PrismaTx, data: PublishData): Promise<boolean>;
  /** Clears current_version_id — the document stops counting for readiness. */
  withdraw(tx: PrismaTx, tenantId: string, documentId: string): Promise<void>;
  /** Adds a locale a published version never had (never edits an existing one). */
  addTranslation(tx: PrismaTx, tenantId: string, versionId: string, row: TranslationRow): Promise<void>;
  /** Used by create-tenant + seed: the four documents as drafts from templates. */
  seedDrafts(tx: PrismaTx, tenantId: string, locales: readonly Locale[]): Promise<void>;
}
